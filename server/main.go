package main

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	webpush "github.com/SherClockHolmes/webpush-go"
	"github.com/google/uuid" // <-- ДОБАВИТЬ ЭТУ СТРОКУ
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/stdlib"
	_ "github.com/jackc/pgx/v5/stdlib"
)

var db *sql.DB

// VAPID ключи
var vapidPublicKey = "BF3Ley-6RMmTycWc-8N-H8Gb8pyLfrC9HGyK8pg-nH1tKkUxLRq_Pr70O-OwDuUXCdRR1hNbtDzrtEARqamXNyI"
var vapidPrivateKey = "Q-c-3Q4OuyOPaAQxIqYgZWb4VxIuwwUCqfMhSU1tnKs"
var contactEmail = "vf12776@gmail.com"

type Message struct {
	ID        string `json:"id"`
	Username  string `json:"username"`
	Text      string `json:"text"`
	IsFile    bool   `json:"isFile,omitempty"`
	FileUrl   string `json:"fileUrl,omitempty"`
	FileName  string `json:"fileName,omitempty"`
	Type      string `json:"type"`
	Timestamp int64  `json:"timestamp"`
}

type pushSubscription struct {
	Endpoint string
	P256dh   string
	Auth     string
}

// Apinator конфигурация
const (
	apinatorAppID  = "10656abd-ac71-446e-8913-b17e26db7753"
	apinatorSecret = "651cd74813a0e9d86f72990b7ac65ad79deadfe63f5e0e1062d536462434b6d9"
)

func initDB() {
	connStr := os.Getenv("DATABASE_URL")
	if connStr == "" {
		log.Fatal("FATAL: DATABASE_URL environment variable not set")
	}

	// Парсим конфигурацию строки подключения
	config, err := pgx.ParseConfig(connStr)
	if err != nil {
		log.Fatal("FATAL: parse config failed: ", err)
	}

	// КРИТИЧЕСКИ ВАЖНО: отключаем кэш prepared statements для совместимости с Supabase Pooler (PgBouncer)
	config.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol

	// Открываем БД с этой конфигурацией
	db = stdlib.OpenDB(*config)

	if err = db.Ping(); err != nil {
		log.Fatal("FATAL: database ping failed: ", err)
	}
	log.Println("DB connected")

	createTableSQL := `
	CREATE TABLE IF NOT EXISTS messages (
		id TEXT PRIMARY KEY,
		username TEXT,
		text TEXT,
		is_file BOOLEAN,
		file_name TEXT,
		file_data BYTEA,
		type TEXT,
		timestamp BIGINT
	)`
	if _, err = db.Exec(createTableSQL); err != nil {
		log.Fatal("FATAL: failed to create messages table: ", err)
	}

	createPushTableSQL := `
	CREATE TABLE IF NOT EXISTS push_subscriptions (
		id SERIAL PRIMARY KEY,
		user_id TEXT NOT NULL,
		endpoint TEXT NOT NULL UNIQUE,
		p256dh TEXT NOT NULL,
		auth TEXT NOT NULL,
		created_at TIMESTAMPTZ DEFAULT NOW()
	)`
	if _, err = db.Exec(createPushTableSQL); err != nil {
		log.Printf("WARN: failed to create push_subscriptions table: %v", err)
	}
}

func saveMessageToDB(m Message, fileData []byte) error {
	_, err := db.Exec(`
		INSERT INTO messages(id, username, text, is_file, file_name, file_data, type, timestamp)
		VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
		m.ID, m.Username, m.Text, m.IsFile, m.FileName, fileData, m.Type, m.Timestamp)
	return err
}

func loadHistory(w http.ResponseWriter, r *http.Request) {
	channelID := r.URL.Query().Get("channel")
	
	var query string
	var args []interface{}
	
	if channelID != "" {
		query = `SELECT m.id, m.username, m.text, m.file_url, m.file_name, m.timestamp, m.channel_id 
		         FROM messages m 
		         WHERE m.channel_id = $1 
		         ORDER BY m.timestamp ASC LIMIT 100`
		args = []interface{}{channelID}
	} else {
		query = `SELECT id, username, text, file_url, file_name, timestamp, channel_id 
		         FROM messages 
		         WHERE channel_id IS NULL 
		         ORDER BY timestamp ASC LIMIT 100`
	}
	
	rows, err := db.Query(query, args...)
	if err != nil {
		http.Error(w, "Failed to load history", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var messages []map[string]interface{}
	for rows.Next() {
		var id, username, text string
		var fileURL, fileName sql.NullString
		var timestamp int64
		var channelID sql.NullString
		
		err := rows.Scan(&id, &username, &text, &fileURL, &fileName, &timestamp, &channelID)
		if err != nil {
			continue
		}
		
		msg := map[string]interface{}{
			"id":        id,
			"username":  username,
			"text":      text,
			"timestamp": timestamp,
		}
		if fileURL.Valid {
			msg["isFile"] = true
			msg["fileUrl"] = fileURL.String
			msg["fileName"] = fileName.String
		}
		if channelID.Valid {
			msg["channelId"] = channelID.String
		}
		messages = append(messages, msg)
	}
	json.NewEncoder(w).Encode(messages)
}
// Отправка события через Apinator (HTTP API)
func triggerApinator(event string, data interface{}) error {
	payload := map[string]interface{}{
		"event": event,
		"data":  data,
	}
	jsonPayload, _ := json.Marshal(payload)
	url := "https://api.apinator.io/v1/apps/" + apinatorAppID + "/triggers"
	req, _ := http.NewRequest("POST", url, bytes.NewBuffer(jsonPayload))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+apinatorSecret)
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		log.Printf("Apinator error: %s", body)
	}
	return nil
}

func sendPushNotification(sub pushSubscription, title, body string) {
	s := &webpush.Subscription{
		Endpoint: sub.Endpoint,
		Keys: webpush.Keys{
			P256dh: sub.P256dh,
			Auth:   sub.Auth,
		},
	}
	payload := map[string]string{"title": title, "body": body}
	payloadBytes, _ := json.Marshal(payload)
	_, err := webpush.SendNotification(payloadBytes, s, &webpush.Options{
		Subscriber:      contactEmail,
		VAPIDPublicKey:  vapidPublicKey,
		VAPIDPrivateKey: vapidPrivateKey,
		TTL:             30,
	})
	if err != nil {
		log.Printf("Push error: %v", err)
	}
}

func subscribeHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		UserID   string `json:"userId"`
		Endpoint string `json:"endpoint"`
		Keys     struct {
			P256dh string `json:"p256dh"`
			Auth   string `json:"auth"`
		} `json:"keys"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}
	_, err := db.Exec(`INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES ($1,$2,$3,$4)
		ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id`,
		req.UserID, req.Endpoint, req.Keys.P256dh, req.Keys.Auth)
	if err != nil {
		log.Printf("DB error saving subscription: %v", err)
		http.Error(w, "DB error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}

func sendMessageHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		Username string `json:"username"`
		Text     string `json:"text"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}
	msg := Message{
		ID:        uuid.New().String(),
		Username:  req.Username,
		Text:      req.Text,
		IsFile:    false,
		Type:      "msg",
		Timestamp: time.Now().Unix(),
	}
	if err := saveMessageToDB(msg, nil); err != nil {
		http.Error(w, "DB error", http.StatusInternalServerError)
		return
	}
	go triggerApinator("new_message", msg)

	go func(sender string, msg Message) {
		rows, err := db.Query(`SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id != $1`, sender)
		if err != nil {
			return
		}
		defer rows.Close()
		for rows.Next() {
			var sub pushSubscription
			if err := rows.Scan(&sub.Endpoint, &sub.P256dh, &sub.Auth); err != nil {
				continue
			}
			title := msg.Username
			body := msg.Text
			sendPushNotification(sub, title, body)
		}
	}(req.Username, msg)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok", "id": msg.ID})
}

func historyHandler(w http.ResponseWriter, r *http.Request) {
	messages := loadHistory()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(messages)
}

func deleteMessageHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		ID       string `json:"id"`
		Username string `json:"username"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}
	var author string
	err := db.QueryRow("SELECT username FROM messages WHERE id=$1", req.ID).Scan(&author)
	if err != nil {
		http.Error(w, "Message not found", http.StatusNotFound)
		return
	}
	if author != req.Username {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	_, err = db.Exec("DELETE FROM messages WHERE id=$1", req.ID)
	if err != nil {
		http.Error(w, "DB error", http.StatusInternalServerError)
		return
	}
	go triggerApinator("delete_message", map[string]string{"id": req.ID})
	w.WriteHeader(http.StatusOK)
}

func clearChatHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		Username string `json:"username"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}
	if req.Username == "" {
		http.Error(w, "Username required", http.StatusBadRequest)
		return
	}
	_, err := db.Exec("DELETE FROM messages")
	if err != nil {
		http.Error(w, "DB error", http.StatusInternalServerError)
		return
	}
	go triggerApinator("clear_chat", nil)
	w.WriteHeader(http.StatusOK)
}

func uploadHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	username := r.FormValue("username")
	if username == "" {
		http.Error(w, "username required", http.StatusBadRequest)
		return
	}
	err := r.ParseMultipartForm(10 << 20)
	if err != nil {
		http.Error(w, "File too large", http.StatusBadRequest)
		return
	}
	file, handler, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "File error", http.StatusBadRequest)
		return
	}
	defer file.Close()
	data, err := io.ReadAll(file)
	if err != nil {
		http.Error(w, "Read error", http.StatusInternalServerError)
		return
	}
	msg := Message{
		ID:        uuid.New().String(),
		Username:  username,
		Text:      handler.Filename,
		IsFile:    true,
		FileName:  handler.Filename,
		Type:      "msg",
		Timestamp: time.Now().Unix(),
	}
	saveMessageToDB(msg, data)
	msg.FileUrl = "/api/file/" + msg.ID
	go triggerApinator("new_message", msg)
	w.Write([]byte(msg.FileUrl))
}

func fileHandler(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/file/")
	var data []byte
	var fileName string
	err := db.QueryRow("SELECT file_data, file_name FROM messages WHERE id=$1", id).Scan(&data, &fileName)
	if err != nil {
		http.Error(w, "File not found", http.StatusNotFound)
		return
	}
	ext := strings.ToLower(filepath.Ext(fileName))
	ctype := "application/octet-stream"
	if ext == ".jpg" || ext == ".jpeg" {
		ctype = "image/jpeg"
	} else if ext == ".png" {
		ctype = "image/png"
	} else if ext == ".gif" {
		ctype = "image/gif"
	} else if ext == ".webm" {
		ctype = "audio/webm"
	}
	w.Header().Set("Content-Type", ctype)
	w.Write(data)
}
type User struct {
	ID          string `json:"id"`
	Username    string `json:"username"`
	DisplayName string `json:"displayName"`
}

type contextKey string
const userContextKey contextKey = "user"

func generateToken() string {
	return uuid.New().String() + "-" + uuid.New().String()
}

func requireAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		auth := r.Header.Get("Authorization")
		if !strings.HasPrefix(auth, "Bearer ") {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		token := strings.TrimPrefix(auth, "Bearer ")
		var userID string
		err := db.QueryRow("SELECT user_id FROM sessions WHERE token = $1", token).Scan(&userID)
		if err != nil {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		ctx := context.WithValue(r.Context(), userContextKey, userID)
		next.ServeHTTP(w, r.WithContext(ctx))
	}
}

func loginHandler(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Username string `json:"username"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	req.Username = strings.TrimSpace(strings.ToLower(req.Username))
	
	if len(req.Username) < 5 {
		http.Error(w, "Min 5 chars", http.StatusBadRequest)
		return
	}
	
	var userID string
	err := db.QueryRow(`INSERT INTO users (username, display_name) VALUES ($1, $1) ON CONFLICT (username) DO NOTHING RETURNING id`, req.Username).Scan(&userID)
	if err == sql.ErrNoRows {
		db.QueryRow("SELECT id FROM users WHERE username = $1", req.Username).Scan(&userID)
	}
	
	token := generateToken()
	db.Exec(`INSERT INTO sessions (token, user_id) VALUES ($1, $2)`, token, userID)
	
	json.NewEncoder(w).Encode(map[string]interface{}{
		"token": token,
		"user": User{ID: userID, Username: req.Username, DisplayName: req.Username},
	})
}

func meHandler(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(userContextKey).(string)
	var u User
	db.QueryRow("SELECT id, username, display_name FROM users WHERE id = $1", userID).Scan(&u.ID, &u.Username, &u.DisplayName)
	json.NewEncoder(w).Encode(u)
}

func main() {
	initDB()
	defer db.Close()

	http.HandleFunc("/api/send", sendMessageHandler)
	http.HandleFunc("/api/messages", historyHandler)
	http.HandleFunc("/api/delete", deleteMessageHandler)
	http.HandleFunc("/api/clear", clearChatHandler)
	http.HandleFunc("/upload", uploadHandler)
	http.HandleFunc("/api/file/", fileHandler)
	http.HandleFunc("/api/vapid-public-key", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(vapidPublicKey))
	})
	http.HandleFunc("/api/subscribe", subscribeHandler)
	http.HandleFunc("/api/login", loginHandler)
	http.HandleFunc("/api/me", requireAuth(meHandler))
	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) { w.Write([]byte("OK")) })

	// SPA static files (dist)
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") || strings.HasPrefix(r.URL.Path, "/upload") {
			http.NotFound(w, r)
			return
		}

		// Для index.html и корня запрещаем кэширование
		if r.URL.Path == "/" || r.URL.Path == "/index.html" {
			w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
			w.Header().Set("Pragma", "no-cache")
			w.Header().Set("Expires", "0")
			http.ServeFile(w, r, "dist/index.html")
			return
		}

		path := filepath.Join("dist", r.URL.Path)
		if info, err := os.Stat(path); err == nil && !info.IsDir() {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
			http.ServeFile(w, r, path)
			return
		}

		// Fallback для SPA роутинга
		w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
		http.ServeFile(w, r, "dist/index.html")
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	log.Printf("Server started on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}
