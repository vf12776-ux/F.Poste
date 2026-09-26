package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	_ "github.com/lib/pq"
)

var db *sql.DB
var jwtSecret = []byte("fposte-secret-key-change-in-prod")
var vapidPublicKey = os.Getenv("VAPID_PUBLIC_KEY")

func initDB() {
	connStr := os.Getenv("DATABASE_URL")
	if connStr == "" {
		log.Fatal("DATABASE_URL not set")
	}
	var err error
	db, err = sql.Open("postgres", connStr)
	if err != nil {
		log.Fatalf("Failed to open DB: %v", err)
	}
	if err = db.Ping(); err != nil {
		log.Fatalf("Failed to ping DB: %v", err)
	}
	log.Println("DB connected")
}

type Claims struct {
	Username string `json:"username"`
	jwt.RegisteredClaims
}

func generateToken(username string) (string, error) {
	claims := &Claims{
		Username: username,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(30 * 24 * time.Hour)),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(jwtSecret)
}

func requireAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		tokenStr := strings.TrimPrefix(authHeader, "Bearer ")
		claims := &Claims{}
		_, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
			return jwtSecret, nil
		})
		if err != nil {
			http.Error(w, "Invalid token", http.StatusUnauthorized)
			return
		}
		r.Header.Set("X-Username", claims.Username)
		next(w, r)
	}
}

func loginHandler(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Username    string `json:"username"`
		DisplayName string `json:"displayName"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}
	req.Username = strings.ToLower(strings.TrimSpace(req.Username))
	if len(req.Username) < 5 {
		http.Error(w, "Username min 5 chars", http.StatusBadRequest)
		return
	}

	var userID string
	err := db.QueryRow("SELECT id FROM users WHERE username = $1", req.Username).Scan(&userID)
	if err == sql.ErrNoRows {
		err = db.QueryRow("INSERT INTO users (username, display_name) VALUES ($1, $2) RETURNING id",
			req.Username, req.DisplayName).Scan(&userID)
		if err != nil {
			http.Error(w, "Failed to create user", http.StatusInternalServerError)
			return
		}
	} else if err != nil {
		http.Error(w, "DB error", http.StatusInternalServerError)
		return
	}

	token, err := generateToken(req.Username)
	if err != nil {
		http.Error(w, "Token generation failed", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"token": token})
}

func meHandler(w http.ResponseWriter, r *http.Request) {
	username := r.Header.Get("X-Username")
	var displayName string
	err := db.QueryRow("SELECT display_name FROM users WHERE username = $1", username).Scan(&displayName)
	if err != nil {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"username":    username,
		"displayName": displayName,
	})
}

func loadHistory(w http.ResponseWriter, r *http.Request) {
	channelID := r.URL.Query().Get("channel")
	var rows *sql.Rows
	var err error

	if channelID != "" {
		rows, err = db.Query(`SELECT id, username, text, file_url, file_name, timestamp, channel_id, edited_at 
		                       FROM messages WHERE channel_id = $1 ORDER BY timestamp ASC LIMIT 100`, channelID)
	} else {
		rows, err = db.Query(`SELECT id, username, text, file_url, file_name, timestamp, channel_id, edited_at 
		                       FROM messages WHERE channel_id IS NULL ORDER BY timestamp ASC LIMIT 100`)
	}
	if err != nil {
		http.Error(w, "Failed to load history", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var messages []map[string]interface{}
	for rows.Next() {
		var id, username, text string
		var fileURL, fileName, chID sql.NullString
		var timestamp int64
		var editedAt sql.NullTime
		if err := rows.Scan(&id, &username, &text, &fileURL, &fileName, &timestamp, &chID, &editedAt); err != nil {
			continue
		}
		msg := map[string]interface{}{
			"id":        id,
			"username":  username,
			"text":      text,
			"timestamp": timestamp,
		}
		if fileURL.Valid {
			msg["fileUrl"] = fileURL.String
			msg["fileName"] = fileName.String
		}
		if chID.Valid {
			msg["channelId"] = chID.String
		}
		if editedAt.Valid {
			msg["edited"] = true
		}
		messages = append(messages, msg)
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(messages)
}

func sendMessageHandler(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Text      string `json:"text"`
		Username  string `json:"username"`
		ChannelID string `json:"channelId"`
		FileURL   string `json:"fileUrl"`
		FileName  string `json:"fileName"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}

	var channelID interface{}
	if req.ChannelID != "" {
		channelID = req.ChannelID
	} else {
		channelID = nil
	}

	var fileURL, fileName interface{}
	if req.FileURL != "" {
		fileURL = req.FileURL
		fileName = req.FileName
	}

	_, err := db.Exec(`INSERT INTO messages (username, text, timestamp, channel_id, file_url, file_name) VALUES ($1, $2, $3, $4, $5, $6)`,
		req.Username, req.Text, time.Now().Unix(), channelID, fileURL, fileName)
	if err != nil {
		http.Error(w, "Failed to send message: "+err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}

func editMessageHandler(w http.ResponseWriter, r *http.Request) {
	username := r.Header.Get("X-Username")
	var req struct {
		ID   string `json:"id"`
		Text string `json:"text"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}

	var msgUsername string
	err := db.QueryRow("SELECT username FROM messages WHERE id = $1", req.ID).Scan(&msgUsername)
	if err != nil || msgUsername != username {
		http.Error(w, "Unauthorized", http.StatusForbidden)
		return
	}

	_, err = db.Exec(`UPDATE messages SET text = $1, edited_at = NOW() WHERE id = $2`, req.Text, req.ID)
	if err != nil {
		http.Error(w, "Failed to edit message", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}

func deleteMessageHandler(w http.ResponseWriter, r *http.Request) {
	username := r.Header.Get("X-Username")
	var req struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}

	var msgUsername string
	err := db.QueryRow("SELECT username FROM messages WHERE id = $1", req.ID).Scan(&msgUsername)
	if err != nil || msgUsername != username {
		http.Error(w, "Unauthorized", http.StatusForbidden)
		return
	}

	_, err = db.Exec("DELETE FROM messages WHERE id = $1", req.ID)
	if err != nil {
		http.Error(w, "Failed to delete", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}

func clearChannelHandler(w http.ResponseWriter, r *http.Request) {
	username := r.Header.Get("X-Username")
	var req struct {
		ChannelID string `json:"channelId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}

	_, err := db.Exec("DELETE FROM messages WHERE channel_id = $1 AND username = $2", req.ChannelID, username)
	if err != nil {
		http.Error(w, "Failed to clear", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}

func clearChatHandler(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Username string `json:"username"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}
	_, err := db.Exec("DELETE FROM messages WHERE username = $1", req.Username)
	if err != nil {
		http.Error(w, "Failed to clear", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}

func listChannels(w http.ResponseWriter, r *http.Request) {
	rows, err := db.Query("SELECT id, name, created_at FROM channels ORDER BY created_at ASC")
	if err != nil {
		http.Error(w, "Failed to load channels", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var channels []map[string]interface{}
	for rows.Next() {
		var id, name string
		var createdAt time.Time
		if err := rows.Scan(&id, &name, &createdAt); err != nil {
			continue
		}
		channels = append(channels, map[string]interface{}{
			"id":        id,
			"name":      name,
			"createdAt": createdAt.Unix(),
		})
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(channels)
}

func createChannel(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}
	req.Name = strings.TrimSpace(strings.ToLower(req.Name))
	if len(req.Name) < 2 {
		http.Error(w, "Min 2 chars", http.StatusBadRequest)
		return
	}

	var id string
	err := db.QueryRow("INSERT INTO channels (name) VALUES ($1) RETURNING id", req.Name).Scan(&id)
	if err != nil {
		http.Error(w, "Channel already exists or DB error", http.StatusConflict)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"id": id, "name": req.Name})
}

func sendPrivateMessage(w http.ResponseWriter, r *http.Request) {
	username := r.Header.Get("X-Username")
	var req struct {
		To       string `json:"to"`
		Text     string `json:"text"`
		FileURL  string `json:"fileUrl"`
		FileName string `json:"fileName"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}
	req.To = strings.ToLower(strings.TrimSpace(req.To))
	if req.To == "" || req.To == username {
		http.Error(w, "Invalid recipient", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(req.Text) == "" && req.FileURL == "" {
		http.Error(w, "Empty message", http.StatusBadRequest)
		return
	}

	var fileURL, fileName interface{}
	if req.FileURL != "" {
		fileURL = req.FileURL
		fileName = req.FileName
	}

	_, err := db.Exec(`INSERT INTO private_messages (from_username, to_username, text, timestamp, file_url, file_name) VALUES ($1, $2, $3, $4, $5, $6)`,
		username, req.To, req.Text, time.Now().Unix(), fileURL, fileName)
	if err != nil {
		http.Error(w, "Failed to send: "+err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}

func loadPrivateHistory(w http.ResponseWriter, r *http.Request) {
	username := r.Header.Get("X-Username")
	other := r.URL.Query().Get("with")
	if other == "" {
		http.Error(w, "Missing 'with' param", http.StatusBadRequest)
		return
	}
	other = strings.ToLower(strings.TrimSpace(other))

	rows, err := db.Query(`SELECT id, from_username, to_username, text, file_url, file_name, timestamp, edited_at 
	                       FROM private_messages 
	                       WHERE (from_username = $1 AND to_username = $2) 
	                          OR (from_username = $2 AND to_username = $1)
	                       ORDER BY timestamp ASC LIMIT 200`, username, other)
	if err != nil {
		http.Error(w, "Failed to load", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var messages []map[string]interface{}
	for rows.Next() {
		var id, from, to, text string
		var fileURL, fileName sql.NullString
		var timestamp int64
		var editedAt sql.NullTime
		if err := rows.Scan(&id, &from, &to, &text, &fileURL, &fileName, &timestamp, &editedAt); err != nil {
			continue
		}
		msg := map[string]interface{}{
			"id":        id,
			"from":      from,
			"to":        to,
			"text":      text,
			"timestamp": timestamp,
		}
		if fileURL.Valid {
			msg["fileUrl"] = fileURL.String
			msg["fileName"] = fileName.String
		}
		if editedAt.Valid {
			msg["edited"] = true
		}
		messages = append(messages, msg)
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(messages)
}

func editPrivateMessageHandler(w http.ResponseWriter, r *http.Request) {
	username := r.Header.Get("X-Username")
	var req struct {
		ID   string `json:"id"`
		Text string `json:"text"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}

	var fromUsername string
	err := db.QueryRow("SELECT from_username FROM private_messages WHERE id = $1", req.ID).Scan(&fromUsername)
	if err != nil || fromUsername != username {
		http.Error(w, "Unauthorized", http.StatusForbidden)
		return
	}

	_, err = db.Exec(`UPDATE private_messages SET text = $1, edited_at = NOW() WHERE id = $2`, req.Text, req.ID)
	if err != nil {
		http.Error(w, "Failed to edit message", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}

func deletePrivateMessageHandler(w http.ResponseWriter, r *http.Request) {
	username := r.Header.Get("X-Username")
	var req struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}

	var fromUsername string
	err := db.QueryRow("SELECT from_username FROM private_messages WHERE id = $1", req.ID).Scan(&fromUsername)
	if err != nil || fromUsername != username {
		http.Error(w, "Unauthorized", http.StatusForbidden)
		return
	}

	_, err = db.Exec("DELETE FROM private_messages WHERE id = $1", req.ID)
	if err != nil {
		http.Error(w, "Failed to delete", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}

func clearPrivateChatHandler(w http.ResponseWriter, r *http.Request) {
	username := r.Header.Get("X-Username")
	var req struct {
		WithUser string `json:"withUser"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}
	req.WithUser = strings.ToLower(strings.TrimSpace(req.WithUser))

	_, err := db.Exec(`DELETE FROM private_messages 
	                   WHERE (from_username = $1 AND to_username = $2) 
	                      OR (from_username = $2 AND to_username = $1)`, username, req.WithUser)
	if err != nil {
		http.Error(w, "Failed to clear", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}

func listPrivateChats(w http.ResponseWriter, r *http.Request) {
	username := r.Header.Get("X-Username")
	rows, err := db.Query(`
		SELECT DISTINCT partner, last_ts 
		FROM (
			SELECT to_username AS partner, MAX(timestamp) AS last_ts 
			FROM private_messages WHERE from_username = $1 GROUP BY to_username
			UNION
			SELECT from_username AS partner, MAX(timestamp) AS last_ts 
			FROM private_messages WHERE to_username = $1 GROUP BY from_username
		) AS combined
		ORDER BY last_ts DESC`, username)
	if err != nil {
		http.Error(w, "Failed to load chats", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var chats []map[string]interface{}
	for rows.Next() {
		var partner string
		var lastTs int64
		if err := rows.Scan(&partner, &lastTs); err != nil {
			continue
		}
		chats = append(chats, map[string]interface{}{
			"partner": partner,
			"lastTs":  lastTs,
		})
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(chats)
}

func uploadHandler(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(25 << 20); err != nil { // 25 MB
		http.Error(w, "File too large", http.StatusRequestEntityTooLarge)
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "No file", http.StatusBadRequest)
		return
	}
	defer file.Close()

	// Генерируем уникальное имя: timestamp_оригинальное_имя
	uniqueName := fmt.Sprintf("%d_%s", time.Now().UnixNano(), header.Filename)
	dst, err := os.Create(fmt.Sprintf("./uploads/%s", uniqueName))
	if err != nil {
		http.Error(w, "Save failed", http.StatusInternalServerError)
		return
	}
	defer dst.Close()

	if _, err := io.Copy(dst, file); err != nil {
		http.Error(w, "Copy failed", http.StatusInternalServerError)
		return
	}
	
	// Возвращаем JSON с путем и именем файла
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"url":  fmt.Sprintf("/uploads/%s", uniqueName),
		"name": header.Filename,
	})
}

func subscribeHandler(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
}

func main() {
	initDB()
	defer db.Close()

	os.MkdirAll("./uploads", 0755)

	http.HandleFunc("/api/login", loginHandler)
	http.HandleFunc("/api/me", requireAuth(meHandler))
	http.HandleFunc("/api/messages", requireAuth(loadHistory))
	http.HandleFunc("/api/send", requireAuth(sendMessageHandler))
	http.HandleFunc("/api/edit", requireAuth(editMessageHandler))
	http.HandleFunc("/api/delete", requireAuth(deleteMessageHandler))
	http.HandleFunc("/api/clear", requireAuth(clearChatHandler))
	http.HandleFunc("/api/clear-channel", requireAuth(clearChannelHandler))
	http.HandleFunc("/api/channels", listChannels)
	http.HandleFunc("/api/channels/create", requireAuth(createChannel))
	http.HandleFunc("/api/private/send", requireAuth(sendPrivateMessage))
	http.HandleFunc("/api/private/edit", requireAuth(editPrivateMessageHandler))
	http.HandleFunc("/api/private/delete", requireAuth(deletePrivateMessageHandler))
	http.HandleFunc("/api/private/clear", requireAuth(clearPrivateChatHandler))
	http.HandleFunc("/api/private/history", requireAuth(loadPrivateHistory))
	http.HandleFunc("/api/private/chats", requireAuth(listPrivateChats))
	http.HandleFunc("/upload", requireAuth(uploadHandler))
	
	// Раздача файлов из папки uploads
	http.Handle("/uploads/", http.StripPrefix("/uploads/", http.FileServer(http.Dir("./uploads"))))
	
	http.HandleFunc("/api/vapid-public-key", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(vapidPublicKey))
	})
	http.HandleFunc("/api/subscribe", subscribeHandler)
	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) { w.Write([]byte("OK")) })

	fs := http.FileServer(http.Dir("./dist"))
	http.Handle("/", fs)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	log.Printf("Server started on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}
