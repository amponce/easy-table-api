import axios from 'axios';
import crypto from 'crypto';

const SERVER_URL = 'http://localhost:3000';
const RETELL_API_KEY = process.env.RETELL_API_KEY || 'test-key';

// Function to create webhook signature
function createWebhookSignature(payload, secret) {
  return 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
}

// Test the inbound webhook endpoint
async function testInboundWebhook() {
  console.log('🧪 Testing Retell Inbound Webhook Endpoint...\n');
  
  // Test payload matching Retell AI webhook spec
  const testPayload = {
    event: 'call_inbound',
    call_inbound: {
      agent_id: 'agent_12345',
      from_number: '+4512345678',
      to_number: '+45123456789'
    }
  };
  
  const payloadString = JSON.stringify(testPayload);
  const signature = createWebhookSignature(payloadString, RETELL_API_KEY);
  
  try {
    console.log('📤 Sending webhook request...');
    console.log('Payload:', JSON.stringify(testPayload, null, 2));
    console.log('Signature:', signature);
    
    const response = await axios.post(
      `${SERVER_URL}/api/retell/inbound-webhook`,
      testPayload,
      {
        headers: {
          'Content-Type': 'application/json',
          'x-retell-signature': signature
        },
        timeout: 5000
      }
    );
    
    console.log('\n✅ Webhook Response:', response.status);
    console.log('Response Data:', JSON.stringify(response.data, null, 2));
    
    // Validate response structure
    const responseData = response.data;
    if (responseData.call_inbound) {
      console.log('\n🎯 Webhook Response Validation:');
      console.log('✅ Has call_inbound object');
      
      if (responseData.call_inbound.dynamic_variables) {
        console.log('✅ Has dynamic_variables');
        console.log('   - caller_phone:', responseData.call_inbound.dynamic_variables.caller_phone);
        console.log('   - restaurant_phone:', responseData.call_inbound.dynamic_variables.restaurant_phone);
      }
      
      if (responseData.call_inbound.metadata) {
        console.log('✅ Has metadata');
        console.log('   - inbound_source:', responseData.call_inbound.metadata.inbound_source);
      }
    }
    
  } catch (error) {
    console.error('\n❌ Webhook Test Failed:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Response:', error.response.data);
    } else {
      console.error('Error:', error.message);
    }
  }
}

// Test invalid webhook (wrong signature)
async function testInvalidWebhook() {
  console.log('\n🧪 Testing Invalid Webhook (Wrong Signature)...\n');
  
  const testPayload = {
    event: 'call_inbound',
    call_inbound: {
      agent_id: 'agent_12345',
      from_number: '+4512345678',
      to_number: '+45123456789'
    }
  };
  
  try {
    const response = await axios.post(
      `${SERVER_URL}/api/retell/inbound-webhook`,
      testPayload,
      {
        headers: {
          'Content-Type': 'application/json',
          'x-retell-signature': 'sha256=invalid-signature'
        },
        timeout: 5000
      }
    );
    
    console.log('❌ Expected this to fail, but got:', response.status);
    
  } catch (error) {
    if (error.response && error.response.status === 401) {
      console.log('✅ Correctly rejected invalid signature:', error.response.status);
      console.log('   Error:', error.response.data.error);
    } else {
      console.error('❌ Unexpected error:', error.message);
    }
  }
}

// Test webhook with different restaurant locations
async function testDifferentLocations() {
  console.log('\n🧪 Testing Location-Based Agent Routing...\n');
  
  const testCases = [
    {
      name: 'Danish Restaurant (Real)',
      from_number: '+4512345678',
      to_number: '+16029950550', // Danish number
      expected_agent: process.env.RETELL_DANISH_AGENT_ID || 'agent_danish',
      expected_location: 'Danish Restaurant'
    },
    {
      name: 'Main Restaurant (Real)',
      from_number: '+4587654321',
      to_number: '+19179202226', // Main number
      expected_agent: process.env.RETELL_DEFAULT_AGENT_ID || 'agent_default',
      expected_location: 'Main Restaurant'
    },
    {
      name: 'Fake Danish Number',
      from_number: '+4511111111',
      to_number: '+4512345678', // Fake Danish
      expected_agent: process.env.RETELL_DANISH_AGENT_ID || 'agent_danish',
      expected_location: 'Restaurant København'
    },
    {
      name: 'Unknown Number (Default)',
      from_number: '+4599999999',
      to_number: '+4599999999', // Unknown
      expected_agent: process.env.RETELL_DEFAULT_AGENT_ID || 'agent_default',
      expected_location: 'Restaurant'
    }
  ];
  
  for (const testCase of testCases) {
    console.log(`📞 Testing ${testCase.name}`);
    console.log(`   From: ${testCase.from_number} → To: ${testCase.to_number}`);
    
    const testPayload = {
      event: 'call_inbound',
      call_inbound: {
        agent_id: 'agent_12345', // This should be overridden
        from_number: testCase.from_number,
        to_number: testCase.to_number
      }
    };
    
    const payloadString = JSON.stringify(testPayload);
    const signature = createWebhookSignature(payloadString, RETELL_API_KEY);
    
    try {
      const response = await axios.post(
        `${SERVER_URL}/api/retell/inbound-webhook`,
        testPayload,
        {
          headers: {
            'Content-Type': 'application/json',
            'x-retell-signature': signature
          },
          timeout: 5000
        }
      );
      
      const responseData = response.data.call_inbound;
      const actualAgent = responseData?.override_agent_id;
      const actualLocation = responseData?.dynamic_variables?.restaurant_location;
      const actualAddress = responseData?.dynamic_variables?.restaurant_address;
      
      console.log(`   ✅ Agent Override: ${actualAgent}`);
      console.log(`   ✅ Location: ${actualLocation}`);
      console.log(`   ✅ Address: ${actualAddress}`);
      
      // Validate routing
      if (actualAgent === testCase.expected_agent && actualLocation === testCase.expected_location) {
        console.log(`   🎯 Routing CORRECT\n`);
      } else {
        console.log(`   ⚠️  Expected: ${testCase.expected_agent} / ${testCase.expected_location}`);
        console.log(`   ⚠️  Got: ${actualAgent} / ${actualLocation}\n`);
      }
      
    } catch (error) {
      console.log(`   ❌ Failed: ${error.response?.data?.error || error.message}\n`);
    }
  }
}

// Run all tests
async function runAllTests() {
  console.log('🚀 Starting Inbound Webhook Tests...\n');
  
  // Check if server is running
  try {
    await axios.get(`${SERVER_URL}/api/schema`);
    console.log('✅ Server is running\n');
  } catch (error) {
    console.error('❌ Server is not running. Please start with: npm start');
    process.exit(1);
  }
  
  await testInboundWebhook();
  await testInvalidWebhook();
  await testDifferentLocations();
  
  console.log('\n🎉 All webhook tests completed!');
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests().catch(console.error);
}

export { testInboundWebhook, testInvalidWebhook, testDifferentLocations }; 