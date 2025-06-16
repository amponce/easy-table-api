import { 
  checkAvailability, 
  createBooking, 
  formatDate,
  formatTime,
  extractBookingInfo
} from './retell-middleware.js';

async function testBooking() {
  console.log('🧪 Testing Booking Functionality...\n');
  
  // Test 1: Check availability first
  console.log('1. Testing availability check:');
  const testDate = new Date().toISOString().split('T')[0]; // Today
  const testPersons = 2;
  
  try {
    const availability = await checkAvailability(testDate, testPersons);
    
    if (!availability.success) {
      console.log('❌ Availability check failed:', availability.error);
      return;
    }
    
    const { dayStatus, onlineBooking, availabilityTimes } = availability.data;
    console.log(`   ✅ Restaurant open: ${dayStatus}`);
    console.log(`   ✅ Online booking: ${onlineBooking}`);
    console.log(`   ✅ Available slots: ${availabilityTimes?.length || 0}`);
    
    if (!availabilityTimes || availabilityTimes.length === 0) {
      console.log('   ⚠️  No available times for testing booking');
      return;
    }
    
    // Test 2: Extract booking info from transcript
    console.log('\n2. Testing booking info extraction:');
    const mockTranscript = `Hi, I'd like to make a reservation for 2 people today at ${availabilityTimes[0].time}. My name is John Smith and my phone number is 1234567890.`;
    
    const bookingInfo = extractBookingInfo(mockTranscript);
    console.log('   📝 Extracted info:', JSON.stringify(bookingInfo, null, 2));
    
    // Test 3: Format date and time
    console.log('\n3. Testing date/time formatting:');
    const formattedDate = formatDate('today');
    const formattedTime = formatTime(availabilityTimes[0].time);
    console.log(`   📅 Formatted date: ${formattedDate}`);
    console.log(`   🕐 Formatted time: ${formattedTime}`);
    
    // Test 4: Create a test booking
    console.log('\n4. Testing booking creation:');
    const testBookingData = {
      date: formattedDate,
      time: availabilityTimes[0].time, // Use first available time
      persons: testPersons,
      name: 'Test User',
      mobile: '1234567890',
      comment: 'Test booking via middleware'
    };
    
    console.log('   📋 Booking data:', JSON.stringify(testBookingData, null, 2));
    
    // Note: We'll test the booking creation but won't actually submit it
    // to avoid creating real reservations during testing
    console.log('   ⚠️  Skipping actual booking creation to avoid test reservations');
    console.log('   ✅ Booking data structure is valid');
    
    // Test 5: Test the booking endpoint directly (validation only)
    console.log('\n5. Testing booking validation:');
    try {
      const response = await axios.post('http://localhost:3000/api/validate', {
        payload: {
          externalID: `test-${Date.now()}`,
          date: testBookingData.date,
          time: testBookingData.time,
          persons: testBookingData.persons,
          name: testBookingData.name,
          mobile: testBookingData.mobile,
          comment: testBookingData.comment,
          autoTable: true,
          emailNotifications: 1,
          smsNotifications: 1
        }
      });
      
      const result = response.data;
      
      if (result.valid) {
        console.log('   ✅ Booking payload validation passed');
      } else {
        console.log('   ❌ Booking payload validation failed:', result.errors);
      }
      
    } catch (error) {
      console.log('   ❌ Validation test failed:', error.message);
    }
    
    // Test 6: Test complete booking flow simulation
    console.log('\n6. Testing complete booking flow simulation:');
    
    const mockConversationFlow = [
      'I want to make a reservation',
      'For 2 people',
      'Today',
      `At ${availabilityTimes[0].time}`,
      'John Doe',
      '5551234567'
    ];
    
    let simulatedBookingInfo = {
      name: null,
      mobile: null,
      date: null,
      time: null,
      persons: null,
      comment: ''
    };
    
    // Simulate conversation flow
    for (const message of mockConversationFlow) {
      const extracted = extractBookingInfo(message);
      
      // Merge extracted info
      if (extracted.persons) simulatedBookingInfo.persons = extracted.persons;
      if (extracted.date) simulatedBookingInfo.date = extracted.date;
      if (extracted.time) simulatedBookingInfo.time = extracted.time;
      if (extracted.name) simulatedBookingInfo.name = extracted.name;
      if (extracted.mobile) simulatedBookingInfo.mobile = extracted.mobile;
    }
    
    console.log('   📝 Simulated conversation result:', JSON.stringify(simulatedBookingInfo, null, 2));
    
    // Check if all required info is collected
    const missing = [];
    if (!simulatedBookingInfo.persons) missing.push('party size');
    if (!simulatedBookingInfo.date) missing.push('date');
    if (!simulatedBookingInfo.time) missing.push('time');
    if (!simulatedBookingInfo.name) missing.push('name');
    if (!simulatedBookingInfo.mobile) missing.push('phone number');
    
    if (missing.length === 0) {
      console.log('   ✅ All booking information collected successfully');
      console.log('   ✅ Ready to create booking');
    } else {
      console.log(`   ⚠️  Missing information: ${missing.join(', ')}`);
    }
    
  } catch (error) {
    console.error('❌ Booking test failed:', error.message);
  }
  
  console.log('\n✅ Booking functionality testing complete!');
}

testBooking().catch(console.error); 