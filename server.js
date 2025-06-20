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
      "pattern": "^[+]?[0-9\\s\\-\\(\\)]{8,15}$",
      "description": "Guest phone number (supports international formats with country codes)"
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

// ===== RETELL AI WEBHOOK ROUTES =====

// Inbound call webhook - captures caller phone number and provides context
app.post('/api/retell/inbound-webhook', (req, res) => {
  console.log('🔥 WEBHOOK ENDPOINT HIT!');
  try {
    console.log('📞 Retell inbound call webhook received:', JSON.stringify(req.body, null, 2));
    
    // Note: Signature verification disabled for testing
    // You can enable it later by setting up proper middleware
    
    // Validate webhook payload structure
    if (!req.body.event || req.body.event !== 'call_inbound') {
      console.log('❌ Invalid webhook event type:', req.body.event);
      return res.status(400).json({
        error: 'Invalid event type'
      });
    }
    
    const callInbound = req.body.call_inbound;
    if (!callInbound) {
      console.log('❌ Missing call_inbound data');
      return res.status(400).json({
        error: 'Missing call_inbound data'
      });
    }
    
    const { agent_id, from_number, to_number } = callInbound;
    
    console.log('📋 Call details:', {
      agent_id,
      from_number,
      to_number
    });
    
    // Location-based agent routing configuration
    // Using same place token for all locations for testing
    const sharedPlaceToken = process.env.EASYTABLE_PLACE_TOKEN;
    
    const locationConfig = {
      // Main Restaurant - Your first Retell number (Default agent)
      '+19179202226': {
        agent_id: process.env.RETELL_DEFAULT_AGENT_ID || 'agent_default',
        location: 'Main Restaurant',
        address: 'New York, USA',
        timezone: 'America/New_York',
        opening_hours: '11:00-23:00',
        language: 'en' // English
      },
      // Danish Restaurant - Your second Retell number (Danish agent)
      '+16029950550': {
        agent_id: process.env.RETELL_DANISH_AGENT_ID || 'agent_danish',
        location: 'Danish Restaurant',
        address: 'Copenhagen, Denmark',
        timezone: 'Europe/Copenhagen',
        opening_hours: '12:00-22:00',
        language: 'da' // Danish
      },
      // Fake Danish number for testing Danish agent
      '+4512345678': {
        agent_id: process.env.RETELL_DANISH_AGENT_ID || 'agent_danish',
        location: 'Restaurant København',
        address: 'Nyhavn 12, 1051 København K',
        timezone: 'Europe/Copenhagen',
        opening_hours: '11:00-23:00',
        language: 'da'
      },
      // Additional fake Danish numbers for multi-location testing
      '+4587654321': {
        agent_id: process.env.RETELL_DANISH_AGENT_ID || 'agent_danish',
        location: 'Restaurant Aarhus',
        address: 'Strøget 25, 8000 Aarhus C',
        timezone: 'Europe/Copenhagen',
        opening_hours: '12:00-22:00',
        language: 'da'
      },
      // Default fallback for any other numbers
      'default': {
        agent_id: agent_id || process.env.RETELL_DEFAULT_AGENT_ID || 'agent_default',
        location: 'Restaurant',
        address: 'Denmark',
        timezone: 'Europe/Copenhagen',
        opening_hours: '11:00-23:00',
        language: 'da'
      }
    };
    
    // Get location configuration based on called number
    const locationInfo = locationConfig[to_number] || locationConfig['default'];
    
    console.log('🏢 Location routing:', {
      called_number: to_number,
      location: locationInfo.location,
      agent_id: locationInfo.agent_id
    });
    
    // Extract caller information for context
    const callerInfo = {
      phone: from_number,
      restaurant_number: to_number,
      location: locationInfo.location,
      timestamp: new Date().toISOString()
    };
    
    // Prepare dynamic variables to pass to the agent
    const dynamicVariables = {
      caller_phone: from_number,
      restaurant_phone: to_number,
      restaurant_location: locationInfo.location,
      restaurant_address: locationInfo.address,
      opening_hours: locationInfo.opening_hours,
      timezone: locationInfo.timezone,
      language: locationInfo.language,
      call_timestamp: callerInfo.timestamp,
      // EasyTable configuration - using shared place token for all locations
      easytable_place_token: sharedPlaceToken,
      // Add any customer lookup data here if you have a customer database
      customer_type: 'inbound_caller'
    };
    
    // Optional: Look up customer information based on phone number
    // You could add database lookup here to get customer history, preferences, etc.
    
    console.log('✅ Providing context to agent:', {
      agent_id: locationInfo.agent_id,
      location: locationInfo.location,
      dynamic_variables: dynamicVariables
    });
    
    // Response to Retell AI with agent configuration and context
    const response = {
      call_inbound: {
        // Override agent based on location
        override_agent_id: locationInfo.agent_id,
        
        // Optionally override agent version
        // override_agent_version: 1,
        
        // Provide dynamic variables for the conversation
        dynamic_variables: dynamicVariables,
        
        // Optional metadata for tracking
        metadata: {
          inbound_source: 'phone_call',
          caller_phone: from_number,
          restaurant_location: locationInfo.location,
          restaurant_address: locationInfo.address,
          processed_at: callerInfo.timestamp,
          easytable_place_token: sharedPlaceToken
        }
      }
    };
    
    console.log('📤 Responding to Retell webhook:', JSON.stringify(response, null, 2));
    
    return res.status(200).json(response);
    
  } catch (error) {
    console.error('❌ Inbound webhook error:', error);
    return res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// Optional: Create outbound phone call (for calling customers back)
app.post('/api/retell/create-call', async (req, res) => {
  try {
    const { to_number, agent_id, dynamic_variables, metadata } = req.body;
    
    if (!to_number) {
      return res.status(400).json({
        error: 'to_number is required'
      });
    }
    
    if (!process.env.RETELL_API_KEY) {
      return res.status(500).json({
        error: 'RETELL_API_KEY not configured'
      });
    }
    
    // Your restaurant's phone number (should be configured in env)
    const from_number = process.env.RESTAURANT_PHONE_NUMBER || '+45123456789';
    
    console.log('📞 Creating outbound call:', {
      from_number,
      to_number,
      agent_id
    });
    
    const callPayload = {
      from_number,
      to_number,
      ...(agent_id && { agent_id }),
      ...(dynamic_variables && { retell_llm_dynamic_variables: dynamic_variables }),
      ...(metadata && { metadata })
    };
    
    const response = await axios.post(
      'https://api.retellai.com/v2/create-phone-call',
      callPayload,
      {
        headers: {
          'Authorization': `Bearer ${process.env.RETELL_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );
    
    console.log('✅ Call created successfully:', response.data.call_id);
    
    return res.json({
      success: true,
      call_id: response.data.call_id,
      call_status: response.data.call_status,
      data: response.data
    });
    
  } catch (error) {
    console.error('❌ Failed to create call:', error.response?.data || error.message);
    
    return res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data || error.message
    });
  }
});

// ===== UTILITY API ROUTES =====

// Simple test endpoint
app.post('/api/test', (req, res) => {
  console.log('✅ Test endpoint hit!');
  res.json({ success: true, message: 'Test endpoint working', body: req.body });
});

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
      persons: persons.toString()
      // Removed distinct: '1' to match the working version
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
        
        console.log('🎯 Processing user message:', userMessage);
        console.log('📝 Full transcript length:', fullTranscript.length);
        
        // Check conversation length to prevent infinite loops
        const conversationTurns = transcript?.length || 0;
        if (conversationTurns > 20) {
          console.log('⏰ Conversation too long, ending call');
          return res.json(createRetellResponse({
            content: "I notice we've been talking for a while. Let me transfer you to our reservation team who can help you complete your booking. Thank you for your patience!",
            end_call: true
          }));
        }
        
        // Check for conversation exit conditions and goodbye loops
        const goodbyeCount = (fullTranscript.match(/goodbye|bye\b/gi) || []).length;
        const thankYouCount = (fullTranscript.match(/thank you|thanks/gi) || []).length;
        
        // End call if too many goodbyes (indicates a loop)
        if (goodbyeCount >= 4) {
          console.log('🔄 Goodbye loop detected, ending call');
          return res.json(createRetellResponse({
            content: "Thank you for calling Jeff's Table! Have a wonderful day!",
            end_call: true
          }));
        }
        
        // Standard goodbye detection
        if (userMessage.toLowerCase().includes('goodbye') || 
            userMessage.toLowerCase().includes('bye') || 
            (userMessage.toLowerCase().includes('thank you') && userMessage.toLowerCase().includes('help')) ||
            userMessage.toLowerCase().includes('that\'s all') ||
            userMessage.toLowerCase().includes('no thanks')) {
          return res.json(createRetellResponse({
            content: "Thank you for calling Jeff's Table! Have a wonderful day!",
            end_call: true
          }));
        }
        
        // Extract booking information from the conversation
        const bookingInfo = extractBookingInfo(fullTranscript);
        
        // Count how many times we've asked for each piece of info to prevent loops
        const askCounts = {
          persons: (fullTranscript.match(/how many people|party size|how many guests/gi) || []).length,
          date: (fullTranscript.match(/what date|which date|when would you like/gi) || []).length,
          time: (fullTranscript.match(/what time|which time|when would you prefer/gi) || []).length,
          name: (fullTranscript.match(/your name|could i get your name/gi) || []).length,
          mobile: (fullTranscript.match(/phone number|mobile number|contact number/gi) || []).length
        };
        
        // Determine what information is still needed
        const missing = [];
        if (!bookingInfo.persons) missing.push('party size');
        if (!bookingInfo.date) missing.push('date');
        if (!bookingInfo.time) missing.push('time');
        if (!bookingInfo.name) missing.push('name');
        if (!bookingInfo.mobile) missing.push('phone number');
        
        console.log('❓ Missing info:', missing);
        console.log('🔢 Ask counts:', askCounts);
        
        let responseContent = '';
        
        // Check if we're stuck in a loop (asked same question 3+ times)
        const maxAsks = 3;
        const stuckOnQuestion = Object.entries(askCounts).find(([key, count]) => count >= maxAsks);
        
        if (stuckOnQuestion) {
          console.log('🔄 Loop detected for:', stuckOnQuestion[0]);
          responseContent = "I'm having trouble understanding. Let me transfer you to our reservation team who can help you directly. Please hold while I connect you.";
          return res.json(createRetellResponse({
            content: responseContent,
            end_call: true
          }));
        }
        
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
                if (availabilityTimes && availabilityTimes.length > 0) {
                  responseContent += " Would you like to make a reservation for one of these times?";
                }
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
          
          console.log('🎯 Attempting booking with:', formattedBookingData);
          
          const bookingResult = await createBooking(formattedBookingData);
          
          if (bookingResult.success) {
            responseContent = `Perfect! I've successfully made your reservation for ${bookingInfo.persons} people on ${bookingInfo.date} at ${bookingInfo.time} under the name ${bookingInfo.name}. You'll receive a confirmation via text message. Have a wonderful day!`;
            return res.json(createRetellResponse({
              content: responseContent,
              end_call: true
            }));
          } else {
            responseContent = `I'm sorry, I wasn't able to complete your reservation. This might be because that time slot is no longer available. Would you like me to check other available times for that date?`;
          }
        } else {
          // Ask for missing information in priority order, but avoid repeating questions
          if (missing.includes('party size') && askCounts.persons < maxAsks) {
            responseContent = "How many people will be dining with us?";
          } else if (missing.includes('date') && askCounts.date < maxAsks) {
            responseContent = "What date would you like to make the reservation for?";
          } else if (missing.includes('time') && askCounts.time < maxAsks) {
            responseContent = "What time would you prefer for your reservation?";
          } else if (missing.includes('name') && askCounts.name < maxAsks) {
            responseContent = "Great! I have the details for your reservation. Could I get your name please?";
          } else if (missing.includes('phone number') && askCounts.mobile < maxAsks) {
            responseContent = "And could I get your phone number for the reservation?";
          } else {
            // If we've asked too many times, offer to transfer
            responseContent = "I'm having some difficulty getting all the information I need. Let me transfer you to our reservation team who can help you complete your booking. Please hold.";
            return res.json(createRetellResponse({
              content: responseContent,
              end_call: true
            }));
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

// Debug endpoint to see what Retell is sending
app.post('/api/debug/retell-call', (req, res) => {
  console.log('🐛 DEBUG: Retell called with:', JSON.stringify(req.body, null, 2));
  console.log('🐛 DEBUG: Headers:', JSON.stringify(req.headers, null, 2));
  res.json({ received: true, body: req.body, timestamp: new Date().toISOString() });
});

// Tool endpoint for Retell AI - handles date format conversion and returns Retell-compatible format
app.post('/api/tools/get_availability', async (req, res) => {
  try {
    // Handle Retell's request format - parameters can be in multiple places
    let params;
    
    if (req.body.args) {
      // Format 1: { args: { date, persons, time } }
      params = req.body.args;
    } else if (req.body.arguments) {
      // Format 2: { arguments: "{\"date\":\"...\",\"persons\":...}" }
      try {
        params = JSON.parse(req.body.arguments);
      } catch (e) {
        params = {};
      }
    } else {
      // Format 3: Direct { date, persons, time }
      params = req.body;
    }
    
    let { date, persons, time } = params;
    
    console.log(`🔧 Retell tool called: date=${date}, persons=${persons}, time=${time}`);
    console.log(`🔍 Request analysis:`, {
      hasArgs: !!req.body.args,
      hasArguments: !!req.body.arguments,
      argumentsType: typeof req.body.arguments,
      extractedParams: params
    });
    
    // Convert persons to number if it's a string
    persons = parseInt(persons);
    
    console.log('🔍 Validation check:', { 
      date: date, 
      dateType: typeof date, 
      dateValid: !!date,
      persons: persons, 
      personsType: typeof persons, 
      personsValid: !isNaN(persons) && persons > 0 
    });
    
    if (!date || isNaN(persons) || persons <= 0) {
      console.log('❌ Missing or invalid required parameters:', { date, persons });
      return res.json({
        available: false,
        alternatives: ["Please provide valid date and number of people"],
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
    
    // Handle "tonight" and "today" requests by using current date
    if (date === 'tonight' || date === 'today') {
      const today = new Date();
      // Use local date instead of UTC to match the timezone
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      date = `${year}-${month}-${day}`;
      console.log(`🔄 Converted "${params.date}" to local date: ${date}`);
    }
    
    // Ensure date is in YYYY-MM-DD format and handle timezone consistently
    if (date && date.match(/^\d{4}-\d{2}-\d{2}$/)) {
      // Date is already in correct format, but let's ensure it's treated as local date
      console.log(`🔄 Using date as-is: ${date}`);
    }
    
    console.log(`🔍 Debug: Calling checkAvailability with date=${date}, persons=${persons}`);
    
    const availability = await checkAvailability(date, persons);
    console.log(`🔍 Raw availability response:`, JSON.stringify(availability, null, 2));
    
    if (!availability.success) {
      console.log(`❌ Availability check failed: ${availability.error}`);
      return res.json({
        available: false,
        alternatives: [
          "I'm having trouble checking availability right now.",
          "Please call us directly at (555) 123-4567 to make a reservation.",
          "Or try a different date."
        ],
        dayStatus: false,
        onlineBooking: false,
        availabilityTimes: [],
        error: "Availability check failed"
      });
    }
    
    const { dayStatus, onlineBooking, availabilityTimes } = availability.data;
    
    console.log(`🔍 Availability data breakdown:`, {
      dayStatus,
      onlineBooking,
      availabilityTimesCount: availabilityTimes ? availabilityTimes.length : 0,
      firstFewTimes: availabilityTimes ? availabilityTimes.slice(0, 5).map(t => t.time) : []
    });
    
    // Check if restaurant is open and online booking is available
    if (!dayStatus || !onlineBooking) {
      console.log(`❌ Restaurant closed or online booking disabled: dayStatus=${dayStatus}, onlineBooking=${onlineBooking}`);
      
      // Instead of returning empty, suggest alternative dates
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];
      
      const dayAfter = new Date();
      dayAfter.setDate(dayAfter.getDate() + 2);
      const dayAfterStr = dayAfter.toISOString().split('T')[0];
      
      return res.json({
        available: false,
        alternatives: [
          "We're closed that day. Try tomorrow or the day after.",
          `Alternative dates: ${tomorrowStr} or ${dayAfterStr}`
        ],
        dayStatus,
        onlineBooking,
        availabilityTimes: [],
        message: "Restaurant closed on requested date"
      });
    }
    
    // If no availability times, check nearby dates for alternatives
    if (!availabilityTimes || availabilityTimes.length === 0) {
      console.log(`❌ No availability on ${date}, checking nearby dates...`);
      
      // Check next few days for availability
      const alternativeDates = [];
      for (let i = 1; i <= 3; i++) {
        const checkDate = new Date(date + 'T00:00:00'); // Add time to avoid timezone issues
        checkDate.setDate(checkDate.getDate() + i);
        const checkDateStr = checkDate.toISOString().split('T')[0];
        
        try {
          const altAvailability = await checkAvailability(checkDateStr, persons);
          if (altAvailability.success && altAvailability.data.availabilityTimes && altAvailability.data.availabilityTimes.length > 0) {
            const dateObj = new Date(checkDateStr + 'T00:00:00');
            const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
            const monthDay = dateObj.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
            alternativeDates.push(`${dayName}, ${monthDay}`);
          }
        } catch (error) {
          console.log(`❌ Error checking ${checkDateStr}:`, error.message);
        }
      }
      
      const alternatives = alternativeDates.length > 0 
        ? [`No availability on that date. Try ${alternativeDates.join(' or ')}.`]
        : ["No availability on that date. Please try a different date or call us directly."];
      
      console.log(`❌ No times available on ${date}. Suggesting: ${alternatives.join(', ')}`);
      return res.json({
        available: false,
        alternatives,
        dayStatus,
        onlineBooking,
        availabilityTimes: [],
        message: `No availability on ${date}. ${alternatives[0]}`
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
        console.log(`🔍 Processing ${availabilityTimes.length} available times to find alternatives for ${time}`);
        
        // Get times within 2 hours of requested time
        const requestedHour = parseInt(time.split(':')[0]);
        const requestedMinute = parseInt(time.split(':')[1] || '0');
        const requestedTotalMinutes = requestedHour * 60 + requestedMinute;
        
        console.log(`🔍 Requested time breakdown: ${requestedHour}:${requestedMinute} = ${requestedTotalMinutes} minutes`);
        
        const nearbyTimes = availabilityTimes
          .map(slot => {
            const [hour, minute] = slot.time.split(':').map(Number);
            const totalMinutes = hour * 60 + minute;
            const diff = Math.abs(totalMinutes - requestedTotalMinutes);
            return { ...slot, diff, totalMinutes };
          })
          .filter(slot => slot.diff <= 120) // Within 2 hours
          .sort((a, b) => a.diff - b.diff)
          .slice(0, 5); // Top 5 closest times
        
        console.log(`🔍 Found ${nearbyTimes.length} nearby times:`, nearbyTimes.map(t => `${t.time} (diff: ${t.diff}min)`));
        
        alternatives = nearbyTimes.map(slot => {
          // Convert to 12-hour format for speech
          const [hours, minutes] = slot.time.split(':');
          const hour = parseInt(hours);
          const period = hour >= 12 ? 'PM' : 'AM';
          const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
          return `${displayHour}:${minutes} ${period}`;
        });
        
        console.log(`🔍 Formatted alternatives:`, alternatives);
      } else {
        console.log(`❌ No available times found in response`);
        alternatives = [
          "No times available for that date.",
          "Try a different date or call us directly."
        ];
      }
      
      console.log(`❌ Requested time ${time} not available. Alternatives: ${alternatives.join(', ')}`);
      return res.json({
        available: false,
        alternatives,
        dayStatus,
        onlineBooking,
        availabilityTimes,
        message: `${time} is not available. Available times: ${alternatives.join(', ')}`
      });
    }
    
  } catch (error) {
    console.error('Tool error:', error);
    
    // Provide helpful alternatives even on error
    return res.json({
      available: false,
      alternatives: [
        "I'm having trouble checking availability right now.",
        "Please call us directly at (555) 123-4567 to make a reservation.",
        "Or try booking online at our website."
      ],
      dayStatus: false,
      onlineBooking: false,
      availabilityTimes: [],
      error: "System error occurred"
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
    
    // Handle Retell's request format - parameters can be in multiple places
    let bookingData;
    
    if (req.body.args) {
      // Format 1: { args: { date, persons, time, ... } }
      bookingData = req.body.args;
    } else if (req.body.arguments) {
      // Format 2: { arguments: "{\"date\":\"...\",\"persons\":...}" }
      try {
        bookingData = JSON.parse(req.body.arguments);
      } catch (e) {
        bookingData = {};
      }
    } else {
      // Format 3: Direct { date, persons, time, ... }
      bookingData = req.body;
    }
    
    // Validate required fields according to your schema
    const required = ['date', 'time', 'persons', 'name', 'mobile'];
    const missing = required.filter(field => !bookingData[field]);
    
    console.log('📋 Booking validation:', { 
      received: Object.keys(bookingData),
      required,
      missing,
      bookingData 
    });
    
    if (missing.length > 0) {
      console.log(`❌ Missing required fields: ${missing.join(', ')}`);
      return res.status(400).json({
        status: 400,
        confirmation: null,
        error: `Missing required fields: ${missing.join(', ')}`
      });
    }
    
    // Validate mobile phone pattern (international formats)
    const mobilePattern = /^[+]?[0-9\s\-\(\)]{8,15}$/;
    const cleanMobile = bookingData.mobile.replace(/[\s\-\(\)]/g, '');
    const digitCount = cleanMobile.replace(/^\+/, '').length;
    
    if (!mobilePattern.test(bookingData.mobile) || digitCount < 8 || digitCount > 15) {
      console.log(`❌ Invalid mobile format: ${bookingData.mobile}`);
      return res.status(400).json({
        status: 400,
        confirmation: null,
        error: 'Mobile number must be 8-15 digits and may include country code'
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
    
    // Always generate a unique external ID (overwrite any provided value to prevent duplicates)
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    completeBookingData.externalID = `retell-${timestamp}-${random}`;
    console.log(`🆔 Generated unique external ID: ${completeBookingData.externalID}`);
    
    // Convert date to proper format if needed
    if (completeBookingData.date.includes('/')) {
      const parts = completeBookingData.date.split('/');
      if (parts.length === 3) {
        completeBookingData.date = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      }
    }
    
    // Handle relative dates and datetime formats
    if (completeBookingData.date === 'tonight' || completeBookingData.date === 'today') {
      const today = new Date();
      completeBookingData.date = today.toISOString().split('T')[0];
      console.log(`🔄 Converted relative date to: ${completeBookingData.date}`);
    } else if (completeBookingData.date && completeBookingData.date.includes('T')) {
      // Handle datetime format like "2025-06-16T19:00:00-07:00"
      completeBookingData.date = completeBookingData.date.split('T')[0];
      console.log(`🔄 Converted datetime to date: ${completeBookingData.date}`);
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
    
    // Handle axios errors properly
    if (error.response) {
      console.error('❌ Axios error response:', error.response.data);
      return res.status(error.response.status).json({
        status: error.response.status,
        confirmation: null,
        error: typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data)
      });
    }
    
    return res.status(500).json({
      status: 500,
      confirmation: null,
      error: 'Internal server error: ' + error.message
    });
  }
});


// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  // Server started silently - deployment trigger
});
