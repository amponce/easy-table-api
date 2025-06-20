// Simple test to verify phone number formats that work with EasyTable API
import { extractBookingInfo } from './retell-middleware.js';

console.log('🧪 Testing Phone Number Extraction for US and Danish formats\n');

// Test cases based on the Danish requirements and US compatibility
const testCases = [
  // US formats (should continue working)
  { 
    name: 'US 10-digit number',
    input: 'My phone number is 1234567890',
    expected: '1234567890'
  },
  {
    name: 'US formatted number',
    input: 'My phone number is 555-123-4567', 
    expected: '5551234567'
  },
  {
    name: 'US with area code',
    input: 'You can reach me at 415-555-1234',
    expected: '4155551234'
  },
  
  // Danish formats
  {
    name: 'Danish 8-digit number',
    input: 'Mit telefonnummer er 12345678',
    expected: '+4512345678'
  },
  {
    name: 'Danish spoken number (four-fifty)',
    input: 'My number is four-fifty one two three four five six',
    expected: '+4554123456'  // Danish: "four-fifty" = "54", so 54123456 (8 digits) → +4554123456  
  },
  {
    name: 'Danish with +45 prefix',
    input: 'My number is +45 12 34 56 78',
    expected: '+4512345678'
  },
  {
    name: 'Danish with spaces',
    input: 'Ring mig på 12 34 56 78',
    expected: '+4512345678'
  }
];

function testPhoneExtraction() {
  console.log('📞 Testing Phone Number Extraction:\n');
  
  let passed = 0;
  let failed = 0;
  
  for (const testCase of testCases) {
    console.log(`🔍 ${testCase.name}:`);
    console.log(`   Input: "${testCase.input}"`);
    
    const result = extractBookingInfo(testCase.input);
    const extracted = result.mobile;
    
    console.log(`   Extracted: "${extracted}"`);
    console.log(`   Expected: "${testCase.expected}"`);
    
    if (extracted === testCase.expected) {
      console.log(`   ✅ PASS\n`);
      passed++;
    } else {
      console.log(`   ❌ FAIL\n`);
      failed++;
    }
  }
  
  console.log(`📊 Results: ${passed} passed, ${failed} failed`);
  
  if (failed > 0) {
    console.log(`\n⚠️  Some tests failed. This may indicate issues with:
- Danish spoken number conversion
- International format handling
- US number compatibility`);
  } else {
    console.log(`\n✅ All tests passed! Phone number extraction is working correctly.`);
  }
}

testPhoneExtraction(); 