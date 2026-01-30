# InsightBase API Collection

This collection contains all the API endpoints for the InsightBase application, following the established patterns and structure.

## Authentication

All requests require a valid JWT token in the Authorization header. The token can be obtained by running the `Login.bru` request first.

## User Endpoints

### 1. Get User Profile
- **Endpoint:** `GET /api/users/profile`
- **Description:** Retrieves the authenticated user's profile information
- **Authentication:** Required

### 2. Create User
- **Endpoint:** `POST /api/users/`
- **Description:** Creates a new user account
- **Authentication:** Required (Admin only)
- **Permissions:** Admin

### 3. Get All Users
- **Endpoint:** `GET /api/users/`
- **Description:** Retrieves a list of all users with optional search and pagination
- **Authentication:** Required (Admin only)
- **Permissions:** Admin
- **Query Parameters:**
  - `name` (optional): Search by name
  - `skip` (optional): Number of records to skip
  - `take` (optional): Number of records to take

### 4. Get User by ID
- **Endpoint:** `GET /api/users/:id`
- **Description:** Retrieves a specific user by ID
- **Authentication:** Required (Admin only)
- **Permissions:** Admin

### 5. Update User
- **Endpoint:** `PUT /api/users/:id`
- **Description:** Updates a specific user by ID
- **Authentication:** Required (Admin only)
- **Permissions:** Admin

### 6. Delete User
- **Endpoint:** `DELETE /api/users/:id`
- **Description:** Deletes a specific user by ID (soft delete)
- **Authentication:** Required (Admin only)
- **Permissions:** Admin

### 7. Ban User
- **Endpoint:** `POST /api/users/ban/:id`
- **Description:** Bans a specific user by ID
- **Authentication:** Required (Admin only)
- **Permissions:** Admin

### 8. Activate User
- **Endpoint:** `POST /api/users/activate/:id`
- **Description:** Activates a specific user by ID
- **Authentication:** Required (Admin only)
- **Permissions:** Admin

### 9. Change Password
- **Endpoint:** `POST /api/users/change-password`
- **Description:** Changes the authenticated user's password
- **Authentication:** Required

## Usage

1. Run the `Login.bru` request to obtain a token
2. Set the token in the environment variables
3. Run the desired user endpoint requests