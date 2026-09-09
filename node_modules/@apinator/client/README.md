# @apinator/client

[![npm version](https://img.shields.io/npm/v/@apinator/client.svg)](https://www.npmjs.com/package/@apinator/client)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/apinator-io/client-js/test.yml?label=CI)](https://github.com/apinator-io/client-js/actions/workflows/test.yml)

JavaScript client SDK for [Apinator](https://apinator.io) — real-time WebSocket messaging for web applications.

## Features

- Public, private, and presence channels
- Automatic reconnection with exponential backoff
- Client events on private/presence channels
- Presence member tracking
- TypeScript-first with full type definitions
- Zero dependencies — works in any modern browser
- Dual ESM + CommonJS builds

## Installation

```bash
npm install @apinator/client
```

Or via CDN:

```html
<script src="https://cdn.jsdelivr.net/npm/@apinator/client/dist/index.mjs" type="module"></script>
```

## Quick Start

```typescript
import { Apinator } from '@apinator/client';

const client = new Apinator({
  appKey: 'your-app-key',
  cluster: 'eu',
});

client.connect();

const channel = client.subscribe('my-channel');

channel.bind('my-event', (data) => {
  console.log('Received:', data);
});
```

## Channel Types

### Public Channels

No authentication required. Any client can subscribe.

```typescript
const channel = client.subscribe('news');
channel.bind('update', (data) => { /* ... */ });
```

### Private Channels

Require server-side authentication. Prefix with `private-`.

```typescript
const client = new Apinator({
  appKey: 'your-app-key',
  cluster: 'eu',
  authEndpoint: '/api/realtime/auth',
});

const channel = client.subscribe('private-orders');
channel.bind('new-order', (data) => { /* ... */ });
```

### Presence Channels

Like private channels, but also track who is subscribed. Prefix with `presence-`.

```typescript
const presence = client.subscribe('presence-chat') as PresenceChannel;

presence.bind('realtime:subscription_succeeded', () => {
  console.log('Members:', presence.getMembers());
  console.log('Me:', presence.me);
});

presence.bind('realtime:member_added', (member) => {
  console.log('Joined:', member);
});

presence.bind('realtime:member_removed', (member) => {
  console.log('Left:', member);
});
```

`channel.me` is derived from the signed `channel_data` returned by your `authEndpoint`.
It becomes available only after `realtime:subscription_succeeded`.

## Client Events

Trigger events directly from the client on private or presence channels:

```typescript
const privateChannel = client.subscribe('private-chat');
privateChannel.trigger('client-typing', { user: 'alice' });
```

## Connection States

Monitor the connection lifecycle:

```typescript
client.bind('state_change', ({ previous, current }) => {
  console.log(`${previous} -> ${current}`);
});
```

States: `initialized` → `connecting` → `connected` → `disconnected` / `unavailable`

## API Reference

See [docs/api-reference.md](docs/api-reference.md) for the full API.

## Browser Support

Any browser with WebSocket and `fetch` support:

- Chrome 42+
- Firefox 39+
- Safari 10.1+
- Edge 14+
- Brave 10+

## Links

- [Installation Guide](docs/installation.md)
- [Quick Start Tutorial](docs/quickstart.md)
- [API Reference](docs/api-reference.md)
- [Architecture Guide](docs/architecture.md)
- [Contributing](CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)

## License

MIT — see [LICENSE](LICENSE).
