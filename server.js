import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import Ajv from 'ajv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Schema for validation
const schema = {
  "type": "object",
  "properties": {
    "externalID": {
      "type": "string",
      "description": "External booking reference ID"
    },
    "date": {
      "type": "string",
      "description": "Reservation date in YYYY-MM-DD or ISO datetime format"
    },
    "time": {
      "type": "string",
      "description": "Reservation time in HH:MM (24-h) - optional if date is ISO format"
    },
    "persons": {
      "type": "integer",
      "minimum": 1,
      "description": "Total number of guests"
    },
    "name": {
      "type": "string",
      "description": "Guest full name"
    },
    "mobile": {
      "type": "string",
      "pattern": "^[0-9]+$",
      "description": "Guest phone number (digits only, including country code)"
    },
    "comment": {
      "type": "string",
      "description": "Special requests / seating prefs",
      "default": ""
    },
    "autoTable": {
      "type": "boolean",
      "description": "Let EasyTable pick the table",
      "default": true
    },
    "emailNotifications": {
      "type": "integer",
      "enum": [0, 1],
      "description": "Send confirmation email? 1 = yes",
      "default": 1
    },
    "smsNotifications": {
      "type": "integer",
      "enum": [0, 1],
      "description": "Send confirmation SMS? 1 = yes",
      "default": 1
    }
  },
  "required": ["externalID", "date", "persons", "name", "mobile"]
};

const ajv = new Ajv();
const validate = ajv.compile(schema);

// API Routes
app.get('/api/schema', (req, res) => {
  res.json(schema);
});

app.post('/api/validate', (req, res) => {
  const { payload } = req.body;
  const valid = validate(payload);
  
  res.json({
    valid,
    errors: validate.errors || []
  });
});

app.post('/api/test-booking', async (req, res) => {
  const { payload, credentials } = req.body;
  
  // Validate payload first
  const valid = validate(payload);
  if (!valid) {
    return res.status(400).json({
      success: false,
      error: 'Payload validation failed',
      validationErrors: validate.errors
    });
  }

  // Check credentials
  const apiKey = credentials?.apiKey || process.env.EASYTABLE_API_KEY?.trim();
  const placeToken = credentials?.placeToken || process.env.EASYTABLE_PLACE_TOKEN?.trim();

  if (!apiKey || !placeToken) {
    return res.status(400).json({
      success: false,
      error: 'Missing API credentials. Provide them in the form or set environment variables.'
    });
  }

  // Transform payload to match EasyTable API format
  const easytablePayload = {
    externalID: payload.externalID,
    date: payload.date.includes('T') ? payload.date : `${payload.date}T${payload.time || '20:00'}:00.000Z`,
    persons: payload.persons,
    name: payload.name,
    mobile: parseInt(payload.mobile),
    autoTable: payload.autoTable,
    emailNotifications: payload.emailNotifications,
    smsNotifications: payload.smsNotifications
  };

  // Add optional fields if they exist
  if (payload.comment) {
    easytablePayload.comment = payload.comment;
  }

  try {
    const response = await axios.post(
      'https://api.easytable.com/v2/bookings',
      easytablePayload,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': apiKey,
          'X-Place-Token': placeToken
        },
        timeout: 10000
      }
    );

    res.json({
      success: true,
      status: response.status,
      data: response.data
    });
  } catch (error) {
    res.json({
      success: false,
      status: error.response?.status || 0,
      error: error.response?.data || error.message,
      message: error.message
    });
  }
});

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 EasyTable API Tester running at http://localhost:${PORT}`);
  console.log(`📝 Open your browser to test the API`);
}); 