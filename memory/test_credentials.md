# Test Credentials

## Admin
- **Username:** `admin`
- **Password:** `admin123`
- **Login endpoint:** `POST /api/admin/login` with body `{"username": "admin", "password": "admin123"}`
- The login returns a token in `response.data.token` that must be passed as `Authorization: Bearer <token>` on subsequent calls.
