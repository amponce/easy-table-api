import axios from 'axios';
import 'dotenv/config';

async function debugAvailability() {
  console.log('🔍 Debugging Availability API Calls...\n');
  
  const apiKey = process.env.EASYTABLE_API_KEY?.trim();
  const placeToken = process.env.EASYTABLE_PLACE_TOKEN?.trim();
  
  if (!apiKey || !placeToken) {
    console.log('❌ Missing API credentials');
    return;
  }
  
  console.log('✅ API credentials found');
  console.log(`API Key: ${apiKey.substring(0, 10)}...`);
  console.log(`Place Token: ${placeToken.substring(0, 10)}...\n`);
  
  // Test different dates and parameters
  const testCases = [
    { date: '2024-12-15', persons: 2, desc: 'Future date (Dec 15)' },
    { date: '2024-12-20', persons: 2, desc: 'Future date (Dec 20)' },
    { date: '2024-12-25', persons: 4, desc: 'Christmas (4 people)' },
    { date: new Date().toISOString().split('T')[0], persons: 2, desc: 'Today' },
    { date: new Date(Date.now() + 24*60*60*1000).toISOString().split('T')[0], persons: 2, desc: 'Tomorrow' },
  ];
  
  for (const testCase of testCases) {
    console.log(`🧪 Testing: ${testCase.desc} (${testCase.date}, ${testCase.persons} people)`);
    
    try {
      const params = new URLSearchParams({
        date: testCase.date,
        persons: testCase.persons.toString(),
        distinct: '1'
      });
      
      console.log(`   📡 API URL: https://api.easytable.com/v2/availability?${params}`);
      
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
      
      const { dayStatus, onlineBooking, availabilityTimes } = response.data;
      
      console.log(`   ✅ Response received:`);
      console.log(`      - Day Status: ${dayStatus}`);
      console.log(`      - Online Booking: ${onlineBooking}`);
      console.log(`      - Available Times: ${availabilityTimes?.length || 0} slots`);
      
      if (availabilityTimes && availabilityTimes.length > 0) {
        console.log(`      - Times: ${availabilityTimes.map(t => t.time).join(', ')}`);
      }
      
    } catch (error) {
      console.log(`   ❌ Error: ${error.response?.status} - ${error.response?.data || error.message}`);
    }
    
    console.log('');
  }
  
  // Test without distinct parameter
  console.log('🧪 Testing without distinct parameter:');
  try {
    const params = new URLSearchParams({
      date: '2024-12-20',
      persons: '2'
    });
    
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
    
    console.log('   ✅ Response without distinct:', JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.log(`   ❌ Error: ${error.response?.status} - ${error.response?.data || error.message}`);
  }
}

debugAvailability().catch(console.error); 