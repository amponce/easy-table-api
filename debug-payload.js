import 'dotenv/config';
import axios from 'axios';

const API_KEY = process.env.EASYTABLE_API_KEY?.trim();
const PLACE_TOKEN = process.env.EASYTABLE_PLACE_TOKEN?.trim();

console.log('🔍 Testing different payload formats...\n');

// Test payloads with different variations
const testPayloads = [
  {
    name: "Original format (from your working index.js)",
    payload: {
      externalID: `probe-${Date.now()}`,
      persons: 2,
      name: 'Alex Johnson',
      mobile: '15551234567',
      comment: 'Prefers indoor seating',
      autoTable: true,
      emailNotifications: 1,
      smsNotifications: 1,
      date: '2025-06-13',
      time: '20:00'
    }
  },
  {
    name: "Minimal required only",
    payload: {
      externalID: `min-${Date.now()}`,
      date: '2025-06-13',
      time: '20:00',
      persons: 2,
      name: 'Alex Johnson',
      mobile: '15551234567'
    }
  },
  {
    name: "Future date (tomorrow)",
    payload: {
      externalID: `future-${Date.now()}`,
      date: new Date(Date.now() + 24*60*60*1000).toISOString().split('T')[0],
      time: '19:00',
      persons: 1,
      name: 'Test User',
      mobile: '1234567890'
    }
  },
  {
    name: "ISO datetime format",
    payload: {
      externalID: `iso-${Date.now()}`,
      date: new Date(Date.now() + 24*60*60*1000).toISOString(),
      persons: 1,
      name: 'Test User',
      mobile: '1234567890'
    }
  }
];

async function testPayload(test) {
  console.log(`\n📋 Testing: ${test.name}`);
  console.log('Payload:', JSON.stringify(test.payload, null, 2));
  
  try {
    const response = await axios.post(
      'https://api.easytable.com/v2/bookings',
      test.payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': API_KEY,
          'X-Place-Token': PLACE_TOKEN
        },
        timeout: 10000
      }
    );
    
    console.log('✅ SUCCESS:', response.status);
    console.log('Response:', JSON.stringify(response.data, null, 2));
    return true;
  } catch (error) {
    console.log('❌ FAILED:', error.response?.status || 'Network Error');
    console.log('Error:', JSON.stringify(error.response?.data || error.message, null, 2));
    return false;
  }
}

// Test all payloads
for (const test of testPayloads) {
  const success = await testPayload(test);
  if (success) {
    console.log('\n🎉 Found working format! Stopping tests.');
    break;
  }
  
  // Wait a bit between requests
  await new Promise(resolve => setTimeout(resolve, 1000));
}

console.log('\n�� Debug complete!'); 