# Arquitetura Técnica
- Front-end: Next.js (React/TypeScript), PWA.
- Local-first: Dexie.js (IndexedDB).
- Sync: Outbox Pattern (mutation_id, server_seq). O servidor é a fonte da verdade para resolução de conflitos, mas a UI não bloqueia esperando a rede.
- Segurança: Isolamento de tenant local; exportação manual em JSON/CSV.
