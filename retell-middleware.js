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
  
  // Extract patterns from transcript - improved regex patterns
  
  // Name extraction - more flexible patterns
  const namePatterns = [
    /(?:name is|i'm|my name is|this is|i am)\s+([a-zA-Z\s]{2,30})(?:\s|$|\.|\,)/i,
    /^([A-Z][a-z]+\s+[A-Z][a-z]+)(?:\s|$|\.|\,)/,  // First Last format
  ];
  
  for (const pattern of namePatterns) {
    const match = transcript.match(pattern);
    if (match && match[1]) {
      const name = match[1].trim();
      // Avoid capturing common words
      if (!name.match(/\b(phone|number|mobile|reservation|table|people|person|guest|today|tomorrow|time|at|for|and|my|is)\b/i)) {
        bookingInfo.name = name;
        break;
      }
    }
  }
  
  // Phone number extraction - more flexible
  const phonePatterns = [
    /(?:phone|number|mobile|call me at)\s*(?:is|at)?\s*([0-9\s\-\+\(\)]{7,15})/i,
    /\b([0-9]{3}[\-\s]?[0-9]{3}[\-\s]?[0-9]{4})\b/,  // Standard US format
    /\b([0-9]{10,11})\b/  // 10-11 digit numbers
  ];
  
  for (const pattern of phonePatterns) {
    const match = transcript.match(pattern);
    if (match && match[1]) {
      const phone = match[1].replace(/[^0-9]/g, '');
      if (phone.length >= 10) {
        bookingInfo.mobile = phone;
        break;
      }
    }
  }
  
  // Party size extraction
  const personsPatterns = [
    /(?:for|party of|table for|reservation for)\s*(\d+)\s*(?:people|persons|guests|ppl)?/i,
    /(\d+)\s*(?:people|persons|guests|ppl)/i,
    /\b(\d+)\s*(?:of us|in our party)/i
  ];
  
  for (const pattern of personsPatterns) {
    const match = transcript.match(pattern);
    if (match && match[1]) {
      const persons = parseInt(match[1]);
      if (persons > 0 && persons <= 20) { // Reasonable range
        bookingInfo.persons = persons;
        break;
      }
    }
  }
  
  // Date extraction
  const datePatterns = [
    /\b(today|tonight)\b/i,
    /\b(tomorrow)\b/i,
    /(\d{4}-\d{2}-\d{2})/,
    /(\d{1,2}\/\d{1,2}\/\d{4})/,
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i
  ];
  
  for (const pattern of datePatterns) {
    const match = transcript.match(pattern);
    if (match && match[1]) {
      bookingInfo.date = match[1];
      break;
    }
  }
  
  // Time extraction - improved patterns
  const timePatterns = [
    /(?:at|for|around)\s*(\d{1,2}:?\d{0,2}\s*(?:am|pm|AM|PM))/i,
    /\b(\d{1,2}:?\d{0,2}\s*(?:am|pm|AM|PM))\b/i,
    /(?:at|for|around)\s*(\d{1,2})\s*(?:o'clock|oclock)/i,
    /\b(\d{1,2}:\d{2})\b/  // 24-hour format
  ];
  
  for (const pattern of timePatterns) {
    const match = transcript.match(pattern);
    if (match && match[1]) {
      bookingInfo.time = match[1];
      break;
    }
  }
  
  return bookingInfo;
};
// Helper function to call your existing availability endpoint

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


// Helper function to create a real booking using EasyTable API directly

export const createBooking = async (bookingData) => {
  try {
    const apiKey = process.env.EASYTABLE_API_KEY?.trim();
    const placeToken = process.env.EASYTABLE_PLACE_TOKEN?.trim();
    
    if (!apiKey || !placeToken) {
      throw new Error('Missing EasyTable API credentials');
    }
    

    // Format the payload according to your schema

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
  
  // Handle MM/DD/YYYY format
  if (dateString.match(/\d{1,2}\/\d{1,2}\/\d{4}/)) {
    const [month, day, year] = dateString.split('/');


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
export const formatAvailableTimesForSpeech = (availabilityTimes) => {
  // Handle case where availabilityTimes is null, undefined, or empty
  if (!availabilityTimes || !Array.isArray(availabilityTimes) || availabilityTimes.length === 0) {
    return "I'm sorry, there are no available times for that date and party size.";
  }
  
  const times = availabilityTimes.map(slot => {
    // Ensure slot has a time property
    if (!slot || !slot.time) {
      return null;
    }
    
    // Convert 24-hour to 12-hour format for speech
    const [hours, minutes] = slot.time.split(':');
    const hour = parseInt(hours);
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}:${minutes} ${period}`;
  }).filter(time => time !== null); // Remove any null entries
  
  if (times.length === 0) {
    return "I'm sorry, there are no available times for that date and party size.";
  } else if (times.length === 1) {
    return `I have ${times[0]} available.`;
  } else if (times.length === 2) {
    return `I have ${times[0]} and ${times[1]} available.`;
  } else {
    const lastTime = times.pop();
    return `I have ${times.join(', ')}, and ${lastTime} available.`;
  }
};

export { retell };



