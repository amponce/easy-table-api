import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import Ajv from 'ajv';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  verifyRetellSignature,
  captureRawBody,
  createRetellResponse,
  extractBookingInfo,
  checkAvailability,
  createBooking,
  handleAvailabilityCheck, 
  handleBookingCreate, 
  handleRetellWebhook,
  formatDate,
  formatTime,
  formatAvailableTimesForSpeech
} from './retell-middleware.js';

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

// ===== UTILITY API ROUTES =====
app.get('/api/schema', (req, res) => {
  res.json(schema);
});

app.get('/api/credentials-status', (req, res) => {
  const hasServerCredentials = !!(process.env.EASYTABLE_API_KEY?.trim() && process.env.EASYTABLE_PLACE_TOKEN?.trim());
  res.json({
    hasServerCredentials,
    message: hasServerCredentials 
      ? 'Server credentials are configured' 
      : 'No server credentials found - please provide them in the form'
  });
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

  try {
    const response = await axios.post(
      'https://api.easytable.com/v2/bookings',
      payload,
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

// ===== EASYTABLE API ROUTES =====

// Standard EasyTable availability endpoint (GET)
app.get('/api/availability', async (req, res) => {
  const { date, persons, typeID } = req.query;
  
  if (!date || !persons) {
    return res.status(400).json({
      success: false,
      error: 'Date and persons parameters are required'
    });
  }

  // Check credentials
  const apiKey = process.env.EASYTABLE_API_KEY?.trim();
  const placeToken = process.env.EASYTABLE_PLACE_TOKEN?.trim();

  if (!apiKey || !placeToken) {
    return res.status(400).json({
      success: false,
      error: 'Missing API credentials'
    });
  }

  try {
    const params = new URLSearchParams({
      date: date,
      persons: persons.toString(),
      distinct: '1' // Get distinct times only
    });
    
    if (typeID) {
      params.append('typeID', typeID.toString());
    }

    const response = await axios.get(
      `https://api.easytable.com/v2/availability?${params}`,
      {
        headers: {
          'X-Api-Key': apiKey,
          'X-Place-Token': placeToken
        },
        timeout: 10000
      }
    );

    res.json({
      success: true,
      data: response.data
    });
  } catch (error) {
    res.json({
      success: false,
      status: error.response?.status || 0,
      error: error.response?.data || error.message
    });
  }
});

// ===== RETELL AI ENDPOINTS =====

// Main webhook endpoint for Retell AI conversation handling
app.post('/api/retell-webhook', handleRetellWebhook);

// Retell availability endpoint (uses improved handlers)
app.post('/api/retell-availability', handleAvailabilityCheck);

// Retell booking endpoint (uses improved handlers)
app.post('/api/retell-booking', handleBookingCreate);

// ===== STATIC ROUTES =====

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
