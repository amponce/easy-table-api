import axios from 'axios';

const SERVER_URL = 'http://localhost:3000';

// Test creating an outbound call
async function testOutboundCall() {
  console.log('🧪 Testing Outbound Call API...\n');
  
  // Test payload for creating an outbound call
  const testPayload = {
    to_number: '+4512345678',
    agent_id: 'agent_12345', // Optional
    dynamic_variables: {
      customer_name: 'John Doe',
      reservation_id: 'RES123',
      purpose: 'confirmation_call'
    },
    metadata: {
      call_type: 'reservation_confirmation',
      restaurant_id: 'rest_123'
    }
  };
  
  try {
    console.log('📤 Creating outbound call...');
    console.log('Payload:', JSON.stringify(testPayload, null, 2));
    
    const response = await axios.post(
      `${SERVER_URL}/api/retell/create-call`,
      testPayload,
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );
    
    console.log('\n✅ Call Creation Response:', response.status);
    console.log('Response Data:', JSON.stringify(response.data, null, 2));
    
    // Validate response structure
    const responseData = response.data;
    if (responseData.success && responseData.call_id) {
      console.log('\n🎯 Call Creation Validation:');
      console.log('✅ Call created successfully');
      console.log('   - Call ID:', responseData.call_id);
      console.log('   - Call Status:', responseData.call_status);
    }
    
  } catch (error) {
    console.error('\n❌ Outbound Call Test Failed:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Response:', error.response.data);
      
      // Check if it's a configuration issue
      if (error.response.data?.error?.includes('RETELL_API_KEY')) {
        console.log('\n💡 Note: This is expected if RETELL_API_KEY is not configured');
        console.log('   Set RETELL_API_KEY environment variable to test actual calls');
      }
    } else {
      console.error('Error:', error.message);
    }
  }
}

// Test validation (missing required fields)
async function testValidation() {
  console.log('\n🧪 Testing API Validation...\n');
  
  try {
    const response = await axios.post(
      `${SERVER_URL}/api/retell/create-call`,
      {}, // Empty payload
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 5000
      }
    );
    
    console.log('❌ Expected validation error, but got:', response.status);
    
  } catch (error) {
    if (error.response && error.response.status === 400) {
      console.log('✅ Correctly rejected invalid payload:', error.response.status);
      console.log('   Error:', error.response.data.error);
    } else {
      console.error('❌ Unexpected error:', error.message);
    }
  }
}

// Run all tests
async function runAllTests() {
  console.log('🚀 Starting Outbound Call API Tests...\n');
  
  // Check if server is running
  try {
    await axios.get(`${SERVER_URL}/api/schema`);
    console.log('✅ Server is running\n');
  } catch (error) {
    console.error('❌ Server is not running. Please start with: npm start');
    process.exit(1);
  }
  
  await testValidation();
  await testOutboundCall();
  
  console.log('\n🎉 All outbound call tests completed!');
  console.log('\n📋 Summary:');
  console.log('   • Inbound webhook: Captures caller info when customers call you');
  console.log('   • Outbound call API: Lets you call customers back');
  console.log('   • For restaurant reservations, you likely only need the inbound webhook');
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests().catch(console.error);
}

export { testOutboundCall, testValidation }; 