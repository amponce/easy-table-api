# EasyTable API Tester

A Node.js web application for testing and validating EasyTable API bookings with a user-friendly interface.

## Features

- 🎯 **API Schema Validation** - Validate booking payloads against the required schema
- 🧪 **Live API Testing** - Test actual bookings with the EasyTable API
- 🔒 **Secure Credentials** - Environment-based API key management
- 🌐 **Web Interface** - Easy-to-use form for creating test bookings
- 📋 **Mock Data** - Pre-filled examples for quick testing

## Important: Sandbox Environment Requirements

⚠️ **Critical for Testing**: When using the EasyTable sandbox environment, you **must use a date from the past** for successful API responses. This appears to be a requirement of their sandbox/testing environment.

**Example working dates:**
- `2025-06-12` (any date before today)
- `2025-06-12T19:00:00.000Z` (ISO format with past date)

Using future dates may result in API errors in the sandbox environment.

## Quick Start

### 1. Clone and Install
```bash
git clone https://github.com/amponce/easy-table-api.git
cd easy-table-api
npm install
```

### 2. Environment Setup
Copy the example environment file and add your credentials:
```bash
cp .env.example .env
```

Edit `.env` and add your EasyTable credentials:
```
EASYTABLE_API_KEY=your_actual_api_key_here
EASYTABLE_PLACE_TOKEN=your_actual_place_token_here
```

### 3. Run the Application
```bash
npm start
```

Open your browser to `http://localhost:3000`

## API Endpoints

### `GET /api/schema`
Returns the JSON schema for booking validation.

### `POST /api/validate`
Validates a booking payload against the schema.

**Request body:**
```json
{
  "payload": {
    "externalID": "booking-123",
    "date": "2025-07-15",
    "time": "19:00",
    "persons": 4,
    "name": "John Doe",
    "mobile": "1234567890"
  }
}
```

### `POST /api/test-booking`
Creates a test booking with the EasyTable API.

**Request body:**
```json
{
  "payload": {
    "externalID": "booking-123",
    "date": "2025-07-15",
    "time": "19:00",
    "persons": 4,
    "name": "John Doe",
    "mobile": "1234567890",
    "comment": "Window seat preferred",
    "autoTable": true,
    "emailNotifications": 1,
    "smsNotifications": 1
  },
  "credentials": {
    "apiKey": "optional_override_key",
    "placeToken": "optional_override_token"
  }
}
```

## Required Fields

- `externalID` - Your unique booking reference
- `date` - Reservation date (YYYY-MM-DD or ISO format)
- `persons` - Number of guests (minimum 1)
- `name` - Guest full name
- `mobile` - Phone number (digits only, including country code)

## Optional Fields

- `time` - Reservation time in HH:MM format (defaults to 20:00 if not provided)
- `comment` - Special requests or seating preferences
- `autoTable` - Let EasyTable pick the table (default: true)
- `emailNotifications` - Send confirmation email (0 or 1, default: 1)
- `smsNotifications` - Send confirmation SMS (0 or 1, default: 1)

## Security

- ✅ Environment variables for API credentials
- ✅ `.env` file excluded from version control
- ✅ Comprehensive `.gitignore` for Node.js projects
- ✅ No hardcoded secrets in source code

## Development

### Project Structure
```
├── server.js          # Main Express server
├── index.js           # Alternative entry point
├── validate-schema.js # Schema validation utilities
├── debug-payload.js   # Debugging utilities
├── public/           # Web interface files
│   ├── index.html    # Main testing interface
│   └── mock-data.html # Mock data examples
├── .env.example      # Environment template
└── .gitignore        # Git ignore rules
```

### Available Scripts
```bash
npm start    # Start the server (production)
npm run dev  # Start with nodemon (development)
npm test     # Run tests (if available)
```

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for deployment instructions to various platforms including Render, Heroku, and others.

## Environment Variables

| Variable | Description | Required |
|----------|-------------|---------|
| `EASYTABLE_API_KEY` | Your EasyTable API key | Yes |
| `EASYTABLE_PLACE_TOKEN` | Your EasyTable place token | Yes |
| `PORT` | Server port (default: 3000) | No |

## Troubleshooting

### Common Issues

1. **API returns errors with future dates**
   - Use a past date (e.g., `2025-07-15`) for sandbox testing

2. **Missing credentials error**
   - Ensure `.env` file exists with valid credentials
   - Check that environment variables are properly set

3. **Validation errors**
   - Verify all required fields are provided
   - Check that `mobile` contains only digits
   - Ensure `persons` is a positive integer

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For issues related to:
- **This tool**: Open an issue on GitHub
- **EasyTable API**: Contact EasyTable support

---

**Note**: This is a testing tool for the EasyTable API. Always test in a sandbox environment before using with live data.

