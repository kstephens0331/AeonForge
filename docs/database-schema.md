# Database Schema

## Tables

### Users
- id: UUID (PK)
- email: string
- password_hash: string
- storage_quota: integer (bytes)
- storage_used: integer (bytes)
- created_at: timestamp
- updated_at: timestamp

### ChatSessions
- id: UUID (PK)
- user_id: UUID (FK)
- title: string
- created_at: timestamp
- updated_at: timestamp

### ChatMessages
- id: UUID (PK)
- session_id: UUID (FK)
- role: enum('user','assistant','system')
- content: text
- tokens: integer
- created_at: timestamp

### Projects
- id: UUID (PK)
- user_id: UUID (FK)
- name: string
- description: text
- created_at: timestamp
- updated_at: timestamp