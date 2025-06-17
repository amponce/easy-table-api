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
  
  // Join all transcript content for analysis
  const fullText = Array.isArray(transcript) 
    ? transcript.map(t => t.content || '').join(' ')
    : transcript || '';
  
  console.log('🔍 Extracting from transcript:', fullText);
  
  // Extract patterns from transcript - improved and more reliable patterns
  
  // Name extraction - more flexible patterns
  const namePatterns = [
    /(?:name is|i'm|my name is|this is|i am|call me)\s+([a-zA-Z\s]{2,30})(?:\s|$|\.|\,|!|\?)/i,
    /^([A-Z][a-z]+\s+[A-Z][a-z]+)(?:\s|$|\.|\,)/,  // First Last format at start
    /\b([A-Z][a-z]+\s+[A-Z][a-z]+)\b/,  // First Last format anywhere
  ];
  
  for (const pattern of namePatterns) {
    const match = fullText.match(pattern);
    if (match && match[1]) {
      const name = match[1].trim();
      // Avoid capturing common words and ensure reasonable length
      if (name.length >= 2 && name.length <= 30 && 
          !name.match(/\b(phone|number|mobile|reservation|table|people|person|guest|today|tomorrow|time|at|for|and|my|is|the|yes|no|sure|okay|great|perfect)\b/i)) {
        bookingInfo.name = name;
        console.log('✅ Extracted name:', name);
        break;
      }
    }
  }
  
  // Phone number extraction - more reliable
  const phonePatterns = [
    /(?:phone|number|mobile|call me at|reach me at)\s*(?:is|at)?\s*([0-9\s\-\+\(\)]{10,15})/i,
    /\b([0-9]{3}[\-\s\.]?[0-9]{3}[\-\s\.]?[0-9]{4})\b/,  // Standard US format
    /\b([0-9]{10,11})\b/  // 10-11 digit numbers
  ];
  
  for (const pattern of phonePatterns) {
    const match = fullText.match(pattern);
    if (match && match[1]) {
      const phone = match[1].replace(/[^0-9]/g, '');
      if (phone.length >= 10 && phone.length <= 11) {
        bookingInfo.mobile = phone;
        console.log('✅ Extracted phone:', phone);
        break;
      }
    }
  }
  
  // Party size extraction - more specific
  const personsPatterns = [
    /(?:for|party of|table for|reservation for)\s*(\d+)\s*(?:people|persons|guests|ppl)?/i,
    /(\d+)\s*(?:people|persons|guests|ppl)/i,
    /\b(\d+)\s*(?:of us|in our party)/i,
    /just\s*(\d+)/i,
    /(\d+)\s*(?:person|guest)/i
  ];
  
  for (const pattern of personsPatterns) {
    const match = fullText.match(pattern);
    if (match && match[1]) {
      const persons = parseInt(match[1]);
      if (persons > 0 && persons <= 20) { // Reasonable range
        bookingInfo.persons = persons;
        console.log('✅ Extracted party size:', persons);
        break;
      }
    }
  }
  
  // Date extraction - more comprehensive
  const datePatterns = [
    /\b(today|tonight)\b/i,
    /\b(tomorrow)\b/i,
    /(\d{4}-\d{2}-\d{2})/,
    /(\d{1,2}\/\d{1,2}\/\d{4})/,
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
    /\b(next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/i
  ];
  
  for (const pattern of datePatterns) {
    const match = fullText.match(pattern);
    if (match && match[1]) {
      bookingInfo.date = match[1];
      console.log('✅ Extracted date:', match[1]);
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
    const match = fullText.match(pattern);
    if (match && match[1]) {
      bookingInfo.time = match[1];
      console.log('✅ Extracted time:', match[1]);
      break;
    }
  }
  
  console.log('📋 Final extracted info:', bookingInfo);
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
      persons: persons.toString()
      // Removed distinct: '1' to see if this was causing empty results
    });
    
    if (typeID) {
      params.append('typeID', typeID.toString());
    }
    
    console.log(`🔍 Making EasyTable API call: https://api.easytable.com/v2/availability?${params}`);
    
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
    
    console.log(`🔍 EasyTable API response status: ${response.status}`);
    console.log(`🔍 EasyTable API response data:`, {
      dayStatus: response.data.dayStatus,
      onlineBooking: response.data.onlineBooking,
      availabilityTimesCount: response.data.availabilityTimes ? response.data.availabilityTimes.length : 0,
      firstFewTimes: response.data.availabilityTimes ? response.data.availabilityTimes.slice(0, 3).map(t => t.time) : []
    });
    
    return {
      success: true,
      data: response.data
    };
  } catch (error) {
    console.error(`❌ EasyTable API error:`, {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      message: error.message
    });
    
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
    
    // Validate required fields
    const required = ['date', 'time', 'persons', 'name', 'mobile'];
    const missing = required.filter(field => !bookingData[field]);
    
    if (missing.length > 0) {
      return {
        success: false,
        status: 400,
        error: `Missing required fields: ${missing.join(', ')}`,
        message: 'Validation failed'
      };
    }
    
    // Format the payload according to your schema
    const payload = {
      externalID: bookingData.externalID || `retell-${Date.now()}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`,
      date: bookingData.date,
      time: bookingData.time,
      persons: parseInt(bookingData.persons),
      name: bookingData.name.trim(),
      mobile: bookingData.mobile.replace(/[^0-9]/g, ''), // Clean phone number
      comment: bookingData.comment || 'Booking made via Retell AI phone system',
      autoTable: bookingData.autoTable !== undefined ? bookingData.autoTable : true,
      emailNotifications: bookingData.emailNotifications !== undefined ? bookingData.emailNotifications : 1,
      smsNotifications: bookingData.smsNotifications !== undefined ? bookingData.smsNotifications : 1
    };
    
    console.log('📤 Sending booking payload:', payload);
    
    const response = await axios.post(
      'https://api.easytable.com/v2/bookings',
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': apiKey,
          'X-Place-Token': placeToken
        },
        timeout: 15000 // Increased timeout
      }
    );
    
    console.log('✅ Booking response:', response.status, response.data);
    
    return {
      success: true,
      status: response.status,
      data: response.data
    };
  } catch (error) {
    console.error('❌ Booking error:', error.response?.data || error.message);
    
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
  console.log('🎤 Formatting times for speech:', availabilityTimes);
  
  // Handle case where availabilityTimes is null, undefined, or empty
  if (!availabilityTimes || !Array.isArray(availabilityTimes) || availabilityTimes.length === 0) {
    return "I'm sorry, there are no available times for that date and party size. Would you like to try a different date?";
  }
  
  const times = availabilityTimes
    .filter(slot => slot && slot.time) // Filter out invalid slots first
    .map(slot => {
      try {
        // Convert 24-hour to 12-hour format for speech
        const [hours, minutes] = slot.time.split(':');
        const hour = parseInt(hours);
        const period = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
        return `${displayHour}:${minutes} ${period}`;
      } catch (error) {
        console.error('❌ Error formatting time:', slot.time, error);
        return null;
      }
    })
    .filter(time => time !== null) // Remove any null entries
    .slice(0, 10); // Limit to first 10 times to avoid overwhelming speech
  
  if (times.length === 0) {
    return "I'm sorry, there are no available times for that date and party size. Would you like to try a different date?";
  } else if (times.length === 1) {
    return `I have ${times[0]} available.`;
  } else if (times.length === 2) {
    return `I have ${times[0]} and ${times[1]} available.`;
  } else if (times.length <= 5) {
    const lastTime = times.pop();
    return `I have ${times.join(', ')}, and ${lastTime} available.`;
  } else {
    // For many times, group them better
    const firstFew = times.slice(0, 3);
    const remaining = times.length - 3;
    return `I have several times available including ${firstFew.join(', ')}, and ${remaining} more options. Which time works best for you?`;
  }
};

export { retell };



