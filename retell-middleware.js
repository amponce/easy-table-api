import Retell from 'retell-sdk';
import 'dotenv/config';
import crypto from 'crypto';
import axios from 'axios';

// Initialize Retell client
const retell = new Retell({
  apiKey: process.env.RETELL_API_KEY,
});

// Middleware to verify Retell webhooks
export const verifyRetellSignature = (req, res, next) => {
  const signature = req.headers['x-retell-signature'];
  const rawBody = req.rawBody || JSON.stringify(req.body);
  
  if (!signature) {
    return res.status(401).json({ error: 'Missing Retell signature' });
  }
  
  try {
    // Verify the webhook signature
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RETELL_API_KEY)
      .update(rawBody)
      .digest('hex');
    
    if (signature !== `sha256=${expectedSignature}`) {
      return res.status(401).json({ error: 'Invalid Retell signature' });
    }
    next();
  } catch (error) {
    console.error('Retell signature verification failed:', error);
    return res.status(401).json({ error: 'Signature verification failed' });
  }
};

// Middleware to capture raw body for signature verification
export const captureRawBody = (req, res, next) => {
  req.rawBody = '';
  req.on('data', (chunk) => {
    req.rawBody += chunk;
  });
  req.on('end', () => {
    next();
  });
};

// Helper function to create Retell response
export const createRetellResponse = (response) => {
  return {
    response_id: Date.now(),
    content: response.content || '',
    content_complete: response.content_complete ?? true,
    end_call: response.end_call ?? false,
  };
};

// Helper function to extract booking information from conversation
export const extractBookingInfo = (transcript) => {
  const bookingInfo = {
    name: null,
    mobile: null,
    date: null,
    time: null,
    persons: null,
    comment: ''
  };
  
  // Extract patterns from transcript
  const nameMatch = transcript.match(/(?:name is|i'm|my name is)\s+([a-zA-Z\s]+)/i);
  if (nameMatch) bookingInfo.name = nameMatch[1].trim();
  
  const phoneMatch = transcript.match(/(?:phone|number|mobile)\s*(?:is)?\s*([0-9\s\-\+\(\)]+)/i);
  if (phoneMatch) bookingInfo.mobile = phoneMatch[1].replace(/[^0-9]/g, '');
  
  const personsMatch = transcript.match(/(?:for|party of|table for)\s*(\d+)\s*(?:people|persons|guests)?/i);
  if (personsMatch) bookingInfo.persons = parseInt(personsMatch[1]);
  
  const dateMatch = transcript.match(/(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}|today|tomorrow)/i);
  if (dateMatch) bookingInfo.date = dateMatch[1];
  
  const timeMatch = transcript.match(/(\d{1,2}:?\d{0,2}\s*(?:am|pm|AM|PM))/i);
  if (timeMatch) bookingInfo.time = timeMatch[1];
  
  return bookingInfo;
};

// Helper function to call EasyTable availability API
export const checkAvailability = async (date, persons, typeID = null) => {
  try {
    const apiKey = process.env.EASYTABLE_API_KEY?.trim();
    const placeToken = process.env.EASYTABLE_PLACE_TOKEN?.trim();
    
    if (!apiKey || !placeToken) {
      throw new Error('Missing EasyTable API credentials');
    }
    
    const params = new URLSearchParams({
      date: date,
      persons: persons.toString(),
      distinct: '1'
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
    
    return {
      success: true,
      data: response.data
    };
  } catch (error) {
    return {
      success: false,
      status: error.response?.status || 0,
      error: error.response?.data || error.message
    };
  }
};

// Helper function to create booking using EasyTable API
export const createBooking = async (bookingData) => {
  try {
    const apiKey = process.env.EASYTABLE_API_KEY?.trim();
    const placeToken = process.env.EASYTABLE_PLACE_TOKEN?.trim();
    
    if (!apiKey || !placeToken) {
      throw new Error('Missing EasyTable API credentials');
    }
    
    // Format the payload according to EasyTable schema
    const payload = {
      externalID: `retell-${Date.now()}`,
      date: bookingData.date,
      time: bookingData.time,
      persons: bookingData.persons,
      name: bookingData.name,
      mobile: bookingData.mobile,
      comment: bookingData.comment || 'Booking made via Retell AI phone system',
      autoTable: true,
      emailNotifications: 1,
      smsNotifications: 1
    };
    
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
    
    return {
      success: true,
      status: response.status,
      data: response.data
    };
  } catch (error) {
    return {
      success: false,
      status: error.response?.status || 0,
      error: error.response?.data || error.message,
      message: error.message
    };
  }
};

// Helper function to format date from conversation
export const formatDate = (dateString) => {
  const today = new Date();
  
  if (dateString.toLowerCase() === 'today') {
    return today.toISOString().split('T')[0];
  }
  
  if (dateString.toLowerCase() === 'tomorrow') {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  }
  
  // Handle YYYY/MM/DD format (like 2025/06/13)
  if (dateString.match(/\d{4}\/\d{1,2}\/\d{1,2}/)) {
    const [year, month, day] = dateString.split('/');
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  
  // Return as-is if already in YYYY-MM-DD format
  return dateString;
};

// Helper function to format time
export const formatTime = (timeString) => {
  if (!timeString) return null;
  
  // Convert 12-hour to 24-hour format
  const match = timeString.match(/(\d{1,2}):?(\d{0,2})\s*(am|pm|AM|PM)/i);
  if (match) {
    let [, hours, minutes = '00', period] = match;
    hours = parseInt(hours);
    
    if (period.toLowerCase() === 'pm' && hours !== 12) {
      hours += 12;
    } else if (period.toLowerCase() === 'am' && hours === 12) {
      hours = 0;
    }
    
    return `${hours.toString().padStart(2, '0')}:${minutes.padStart(2, '0')}`;
  }
  
  return timeString;
};

// Helper function to format available times for speech
export const formatAvailableTimesForSpeech = (availabilityData) => {
  if (!availabilityData || !availabilityData.length) {
    return "I'm sorry, there are no available times for that date and party size.";
  }
  
  const times = availabilityData.map(slot => {
    // Convert 24-hour to 12-hour format for speech
    const [hours, minutes] = slot.time.split(':');
    const hour = parseInt(hours);
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}:${minutes} ${period}`;
  });
  
  if (times.length === 1) {
    return `I have ${times[0]} available.`;
  } else if (times.length === 2) {
    return `I have ${times[0]} and ${times[1]} available.`;
  } else {
    const lastTime = times.pop();
    return `I have ${times.join(', ')}, and ${lastTime} available.`;
  }
};

// ===== RETELL ENDPOINT HANDLERS =====

// Retell Availability Endpoint
export const handleAvailabilityCheck = async (req, res) => {
  try {
    // Handle both Retell formats (direct params or nested under args)
    const params = req.body.args || req.body;
    let { date, persons, time } = params;
    
    if (!date || !persons) {
      return res.status(400).json({ 
        success: false, 
        error: 'Date and persons are required',
        received: params
      });
    }
    
    // Format date properly
    const formattedDate = formatDate(date);
    
    // Call EasyTable availability API
    const result = await checkAvailability(formattedDate, persons);
    
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }
    
    // Format response for Retell's expected structure
    const response = {
      success: true,
      data: {
        onlineBooking: result.data.onlineBooking === 'open',
        dayStatus: result.data.dayStatus === 'open',
        availabilityTimes: result.data.times || []
      }
    };
    
    return res.json(response);
    
  } catch (error) {
    console.error('Availability check error:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

// Retell Booking Endpoint  
export const handleBookingCreate = async (req, res) => {
  try {
    // Handle both Retell formats
    const params = req.body.args || req.body;
    let { date, time, persons, name, mobile, comment } = params;
    
    if (!date || !time || !persons || !name || !mobile) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required booking information',
        required: ['date', 'time', 'persons', 'name', 'mobile'],
        received: params
      });
    }
    
    // Format date and time
    const formattedDate = formatDate(date);
    const formattedTime = formatTime(time);
    
    // Create the booking
    const result = await createBooking({
      date: formattedDate,
      time: formattedTime,
      persons: parseInt(persons),
      name: name,
      mobile: mobile.toString(),
      comment: comment || 'Booking made via Retell AI'
    });
    
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        message: result.message
      });
    }
    
    // Format response for Retell
    const response = {
      success: true,
      bookingID: result.data.bookingID,
      customerID: result.data.customerID,
      message: `Booking confirmed for ${name}`
    };
    
    return res.json(response);
    
  } catch (error) {
    console.error('Booking create error:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

// Main webhook handler for Retell conversation flow
export const handleRetellWebhook = async (req, res) => {
  try {
    const { name, args, call, event, transcript } = req.body;
    
    // Handle function calls
    if (name === 'get_availability') {
      return await handleAvailabilityCheck({ body: { args } }, res);
    } else if (name === 'create_booking') {
      return await handleBookingCreate({ body: { args } }, res);
    }
    
    // Handle conversation flow events
    if (event) {
      switch (event) {
        case 'call_started':
          return res.json(createRetellResponse({
            content: "Hello! Welcome to our restaurant. I can help you make a reservation. How many people will be dining with us?"
          }));
          
        case 'call_ended':
          return res.json({ received: true });
          
        case 'response_required':
          // Handle conversation flow here if needed
          return res.json(createRetellResponse({
            content: "I'm here to help with your reservation. What can I do for you?"
          }));
          
        default:
          return res.json({ received: true });
      }
    }
    
    // Default response for other webhook types
    return res.json({
      success: true,
      message: 'Webhook received'
    });
    
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

export { retell };
