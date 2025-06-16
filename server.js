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

// Retell AI Webhook Endpoints

// Main webhook endpoint for Retell AI conversation handling
app.post('/api/retell-webhook', captureRawBody, verifyRetellSignature, async (req, res) => {
  try {
    const { event, call, transcript } = req.body;
    
    // Handle different Retell events
    switch (event) {
      case 'call_started':
        const currentDate = new Date().toLocaleDateString('en-US', { 
          weekday: 'long', 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        });
        return res.json(createRetellResponse({
          content: `Hello! Welcome to Jeff's Table. Today is ${currentDate}. I can help you make a reservation. How many people will be dining with us?`
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
              // Check if the restaurant is open and online booking is available
              const { dayStatus, onlineBooking, availabilityTimes } = availability.data;
              
              if (!dayStatus) {
                responseContent = "I'm sorry, the restaurant is closed on that date. Could you try a different date?";
              } else if (!onlineBooking) {
                responseContent = "Online booking is not available for that date. Please call the restaurant directly to make a reservation.";
              } else {
                // Pass the availabilityTimes array instead of the full data object
                responseContent = formatAvailableTimesForSpeech(availabilityTimes);
              }
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
  
  const availability = await checkAvailability(date, persons, typeID);
  return res.json(availability);
});

// Tool endpoint for Retell AI - handles date format conversion and returns Retell-compatible format
app.post('/api/tools/get_availability', async (req, res) => {
  try {
    let { date, persons, time } = req.body;
    
    if (!date || !persons) {
      return res.json({
        available: false,
        alternatives: [],
        dayStatus: false,
        onlineBooking: false,
        availabilityTimes: []
      });
    }
    
    // Convert date format from YYYY/MM/DD to YYYY-MM-DD
    if (date.includes('/')) {
      const parts = date.split('/');
      if (parts.length === 3) {
        date = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      }
    }
    
    // Ensure we're using the correct year (2025)
    const currentYear = new Date().getFullYear();
    if (date.startsWith('2024-')) {
      date = date.replace('2024-', `${currentYear}-`);
      console.log(`🔄 Updated date from 2024 to ${currentYear}: ${date}`);
    }
    
    console.log(`🔧 Retell tool called: date=${date}, persons=${persons}, time=${time}`);
    
    const availability = await checkAvailability(date, persons);
    
    if (!availability.success) {
      console.log(`❌ Availability check failed: ${availability.error}`);
      return res.json({
        available: false,
        alternatives: [],
        dayStatus: false,
        onlineBooking: false,
        availabilityTimes: []
      });
    }
    
    const { dayStatus, onlineBooking, availabilityTimes } = availability.data;
    
    // Check if restaurant is open and online booking is available
    if (!dayStatus || !onlineBooking) {
      console.log(`❌ Restaurant closed or online booking disabled: dayStatus=${dayStatus}, onlineBooking=${onlineBooking}`);
      return res.json({
        available: false,
        alternatives: [],
        dayStatus,
        onlineBooking,
        availabilityTimes: []
      });
    }
    
    // Check if the specific requested time is available
    const requestedTimeAvailable = availabilityTimes && availabilityTimes.some(slot => slot.time === time);
    
    if (requestedTimeAvailable) {
      console.log(`✅ Requested time ${time} is available!`);
      return res.json({
        available: true,
        alternatives: [],
        dayStatus,
        onlineBooking,
        availabilityTimes
      });
    } else {
      // Find alternative times (closest to requested time)
      let alternatives = [];
      if (availabilityTimes && availabilityTimes.length > 0) {
        // Get times within 2 hours of requested time
        const requestedHour = parseInt(time.split(':')[0]);
        const requestedMinute = parseInt(time.split(':')[1] || '0');
        const requestedTotalMinutes = requestedHour * 60 + requestedMinute;
        
        const nearbyTimes = availabilityTimes
          .map(slot => {
            const [hour, minute] = slot.time.split(':').map(Number);
            const totalMinutes = hour * 60 + minute;
            const diff = Math.abs(totalMinutes - requestedTotalMinutes);
            return { ...slot, diff };
          })
          .filter(slot => slot.diff <= 120) // Within 2 hours
          .sort((a, b) => a.diff - b.diff)
          .slice(0, 5) // Top 5 closest times
          .map(slot => {
            // Convert to 12-hour format for speech
            const [hours, minutes] = slot.time.split(':');
            const hour = parseInt(hours);
            const period = hour >= 12 ? 'PM' : 'AM';
            const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
            return `${displayHour}:${minutes} ${period}`;
          });
        
        alternatives = nearbyTimes;
      }
      
      console.log(`❌ Requested time ${time} not available. Alternatives: ${alternatives.join(', ')}`);
      return res.json({
        available: false,
        alternatives,
        dayStatus,
        onlineBooking,
        availabilityTimes
      });
    }
    
  } catch (error) {
    console.error('Tool error:', error);
    return res.json({
      available: false,
      alternatives: [],
      dayStatus: false,
      onlineBooking: false,
      availabilityTimes: []
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

// Tool endpoint for Retell AI - create booking with proper response format
app.post('/api/tools/create_booking', async (req, res) => {
  try {
    console.log('🔧 Retell create_booking tool called:', req.body);
    
    const bookingData = req.body;
    
    // Validate required fields according to your schema
    const required = ['externalID', 'date', 'time', 'persons', 'name', 'mobile'];
    const missing = required.filter(field => !bookingData[field]);
    
    if (missing.length > 0) {
      console.log(`❌ Missing required fields: ${missing.join(', ')}`);
      return res.status(400).json({
        status: 400,
        confirmation: null,
        error: `Missing required fields: ${missing.join(', ')}`
      });
    }
    
    // Validate mobile phone pattern (10-11 digits)
    const mobilePattern = /^[0-9]{10,11}$/;
    if (!mobilePattern.test(bookingData.mobile)) {
      console.log(`❌ Invalid mobile format: ${bookingData.mobile}`);
      return res.status(400).json({
        status: 400,
        confirmation: null,
        error: 'Mobile number must be 10-11 digits'
      });
    }
    
    // Validate time pattern (HH:MM 24-hour format)
    const timePattern = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timePattern.test(bookingData.time)) {
      console.log(`❌ Invalid time format: ${bookingData.time}`);
      return res.status(400).json({
        status: 400,
        confirmation: null,
        error: 'Time must be in HH:MM format (24-hour)'
      });
    }
    
    // Set defaults for optional fields
    const completeBookingData = {
      ...bookingData,
      comment: bookingData.comment || '',
      autoTable: bookingData.autoTable !== undefined ? bookingData.autoTable : true,
      emailNotifications: bookingData.emailNotifications !== undefined ? bookingData.emailNotifications : 1,
      smsNotifications: bookingData.smsNotifications !== undefined ? bookingData.smsNotifications : 1
    };
    
    // Convert date to proper format if needed
    if (completeBookingData.date.includes('/')) {
      const parts = completeBookingData.date.split('/');
      if (parts.length === 3) {
        completeBookingData.date = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      }
    }
    
    // Ensure we're using the correct year (2025)
    const currentYear = new Date().getFullYear();
    if (completeBookingData.date.startsWith('2024-')) {
      completeBookingData.date = completeBookingData.date.replace('2024-', `${currentYear}-`);
      console.log(`🔄 Updated booking date from 2024 to ${currentYear}: ${completeBookingData.date}`);
    }
    
    console.log('📝 Processed booking data:', completeBookingData);
    
    const result = await createBooking(completeBookingData);
    
    if (result.success) {
      console.log('✅ Booking created successfully:', result.data);
      return res.status(200).json({
        status: 200,
        confirmation: result.data?.bookingID || result.data?.confirmation || result.data?.id || 'Booking confirmed',
        message: 'Booking created successfully'
      });
    } else {
      console.log('❌ Booking failed:', result.error);
      // Ensure we return a proper JSON object, not an array
      const errorMessage = typeof result.error === 'string' ? result.error : 
                          Array.isArray(result.error) ? result.error.join(', ') :
                          JSON.stringify(result.error);
      
      return res.status(400).json({
        status: 400,
        confirmation: null,
        error: errorMessage
      });
    }
    
  } catch (error) {
    console.error('❌ Create booking tool error:', error);
    return res.status(500).json({
      status: 500,
      confirmation: null,
      error: 'Internal server error'
    });
  }
});


// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  // Server started silently
});
