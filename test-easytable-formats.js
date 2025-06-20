import 'dotenv/config';
import axios from 'axios';

const API_KEY = process.env.EASYTABLE_API_KEY?.trim();
const PLACE_TOKEN = process.env.EASYTABLE_PLACE_TOKEN?.trim();

if (!API_KEY || !PLACE_TOKEN) {
  console.error('❌ Missing API credentials');
  process.exit(1);
}

const testFormats = [
  { name: 'With +45', mobile: '+4512345678' },
  { name: 'Without +45', mobile: '4512345678' },
  { name: '8 digits only', mobile: '12345678' },
  { name: 'US format', mobile: '15551234567' }
];

async function testEasyTableFormat(format) {
  try {
    const payload = {
      externalID: `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      date: '2025-06-22',
      time: '18:00',
      persons: 2,
      name: 'Test User',
      mobile: format.mobile,
      comment: `Testing ${format.name}`,
      autoTable: true,
      emailNotifications: 1,
      smsNotifications: 1
    };

    console.log(`\n🧪 Testing ${format.name}: ${format.mobile}`);
    
    const response = await axios.post(
      'https://api.easytable.com/v2/bookings',
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': API_KEY,
          'X-Place-Token': PLACE_TOKEN
        },
        timeout: 10000
      }
    );

    console.log(`✅ SUCCESS: ${response.status}`);
    console.log(`   Response:`, response.data);
    return { success: true, format: format.name, response: response.data };
    
  } catch (error) {
    console.log(`❌ FAILED: ${error.response?.status || 'Network Error'}`);
    console.log(`   Error:`, error.response?.data || error.message);
    return { success: false, format: format.name, error: error.response?.data || error.message };
  }
}

async function runTests() {
  console.log('🧪 Testing EasyTable API phone number formats...');
  
  for (const format of testFormats) {
    await testEasyTableFormat(format);
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second between tests
  }
  
  console.log('\n🏁 Test complete!');
}

runTests(); 