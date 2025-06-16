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

// API Routes
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

// EasyTable availability endpoint
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

// Retell AI Webhook Endpoints

// Main webhook endpoint for Retell AI conversation handling
app.post('/api/retell-webhook', captureRawBody, verifyRetellSignature, async (req, res) => {
  try {
    const { event, call, transcript } = req.body;
    
    // Handle different Retell events
    switch (event) {
      case 'call_started':
        return res.json(createRetellResponse({
          content: "Hello! Welcome to our restaurant. I can help you make a reservation. How many people will be dining with us?"
        }));
        
      case 'call_ended':
        return res.json({ received: true });
        
      case 'response_required':
        const userMessage = transcript?.filter(t => t.role === 'user').pop()?.content || '';
        const fullTranscript = transcript?.map(t => t.content).join(' ') || '';
        
        // Extract booking information from the conversation
        const bookingInfo = extractBookingInfo(fullTranscript);
        
        // Determine what information is still needed
        const missing = [];
        if (!bookingInfo.persons) missing.push('party size');
        if (!bookingInfo.date) missing.push('date');
        if (!bookingInfo.time) missing.push('time');
        if (!bookingInfo.name) missing.push('name');
        if (!bookingInfo.mobile) missing.push('phone number');
        
        let responseContent = '';
        
        if (userMessage.toLowerCase().includes('availability') || userMessage.toLowerCase().includes('available')) {
          // User is asking about availability
          if (bookingInfo.date && bookingInfo.persons) {
            const formattedDate = formatDate(bookingInfo.date);
            const availability = await checkAvailability(formattedDate, bookingInfo.persons);
            
            if (availability.success) {
              responseContent = formatAvailableTimesForSpeech(availability.data);
            } else {
              responseContent = "I'm having trouble checking availability right now. Could you try again or call us directly?";
            }
          } else {
            responseContent = "I'd be happy to check availability. Please tell me the date and how many people will be dining.";
          }
        } else if (missing.length === 0) {
          // All information collected, attempt to make the booking
          const formattedBookingData = {
            ...bookingInfo,
            date: formatDate(bookingInfo.date),
            time: formatTime(bookingInfo.time)
          };
          
          const bookingResult = await createBooking(formattedBookingData);
          
          if (bookingResult.success) {
            responseContent = `Perfect! I've successfully made your reservation for ${bookingInfo.persons} people on ${bookingInfo.date} at ${bookingInfo.time} under the name ${bookingInfo.name}. You'll receive a confirmation via text message. Is there anything else I can help you with?`;
          } else {
            responseContent = `I'm sorry, I wasn't able to complete your reservation. This might be because that time slot is no longer available. Would you like me to check other available times for that date?`;
          }
        } else {
          // Ask for missing information
          if (missing.includes('party size')) {
            responseContent = "How many people will be dining with us?";
          } else if (missing.includes('date')) {
            responseContent = "What date would you like to make the reservation for?";
          } else if (missing.includes('time')) {
            responseContent = "What time would you prefer for your reservation?";
          } else if (missing.includes('name')) {
            responseContent = "Great! I have the details for your reservation. Could I get your name please?";
          } else if (missing.includes('phone number')) {
            responseContent = "And could I get your phone number for the reservation?";
          }
        }
        
        return res.json(createRetellResponse({
          content: responseContent
        }));
        
      default:
        return res.json({ received: true });
    }
  } catch (error) {
    console.error('Retell webhook error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Endpoint to check availability via Retell (can be called directly)
app.post('/api/retell-availability', async (req, res) => {
  const { date, persons, typeID } = req.body;
  
  if (!date || !persons) {
    return res.status(400).json({
      success: false,
      error: 'Date and persons are required'
    });
  }
  
  // Format the date properly
  const formattedDate = formatDate(date);
  const availability = await checkAvailability(formattedDate, persons, typeID);
  return res.json(availability);
});

// Enhanced availability endpoint that can handle both GET and POST with proper date formatting
app.all('/api/availability-retell', async (req, res) => {
  // Get parameters from either query (GET) or body (POST)
  const params = req.method === 'GET' ? req.query : req.body;
  const { date, persons, typeID } = params;
  
  if (!date || !persons) {
    return res.status(400).json({
      success: false,
      error: 'Date and persons are required'
    });
  }
  
  try {
    // Format the date properly to handle different formats
    const formattedDate = formatDate(date.toString());
    console.log(`Checking availability for date: ${date} -> formatted: ${formattedDate}, persons: ${persons}`);
    
    const availability = await checkAvailability(formattedDate, parseInt(persons), typeID ? parseInt(typeID) : null);
    return res.json(availability);
  } catch (error) {
    console.error('Availability check error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Endpoint to create booking via Retell (can be called directly)
app.post('/api/retell-booking', async (req, res) => {
  const bookingData = req.body;
  
  // Validate required fields
  const required = ['date', 'time', 'persons', 'name', 'mobile'];
  const missing = required.filter(field => !bookingData[field]);
  
  if (missing.length > 0) {
    return res.status(400).json({
      success: false,
      error: `Missing required fields: ${missing.join(', ')}`
    });
  }
  
  const result = await createBooking(bookingData);
  return res.json(result);
});

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  // Server started silently
});
