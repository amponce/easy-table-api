import { 
  checkAvailability, 
  formatAvailableTimesForSpeech, 
  extractBookingInfo,
  formatDate,
  formatTime,
  createBooking
} from './retell-middleware.js';

async function simulateRetellConversation() {
  console.log('🎭 Simulating Complete Retell Conversation Flow...\n');
  
  // Simulate a complete conversation
  const conversationSteps = [
    {
      step: 1,
      userMessage: "Hi, I'd like to make a reservation",
      description: "Initial greeting"
    },
    {
      step: 2,
      userMessage: "For 4 people",
      description: "Party size provided"
    },
    {
      step: 3,
      userMessage: "For today",
      description: "Date provided"
    },
    {
      step: 4,
      userMessage: "What times are available?",
      description: "Availability request"
    },
    {
      step: 5,
      userMessage: "I'll take 7:00 PM",
      description: "Time selection"
    },
    {
      step: 6,
      userMessage: "My name is Sarah Johnson",
      description: "Name provided"
    },
    {
      step: 7,
      userMessage: "My phone number is 555-123-4567",
      description: "Phone provided"
    }
  ];
  
  let fullTranscript = '';
  let bookingInfo = {
    name: null,
    mobile: null,
    date: null,
    time: null,
    persons: null,
    comment: ''
  };
  
  for (const step of conversationSteps) {
    console.log(`📞 Step ${step.step}: ${step.description}`);
    console.log(`   User: "${step.userMessage}"`);
    
    // Add to full transcript
    fullTranscript += step.userMessage + ' ';
    
    // Extract info from current message
    const currentInfo = extractBookingInfo(step.userMessage);
    
    // Merge with existing info
    if (currentInfo.persons) bookingInfo.persons = currentInfo.persons;
    if (currentInfo.date) bookingInfo.date = currentInfo.date;
    if (currentInfo.time) bookingInfo.time = currentInfo.time;
    if (currentInfo.name) bookingInfo.name = currentInfo.name;
    if (currentInfo.mobile) bookingInfo.mobile = currentInfo.mobile;
    
    // Determine what information is still needed
    const missing = [];
    if (!bookingInfo.persons) missing.push('party size');
    if (!bookingInfo.date) missing.push('date');
    if (!bookingInfo.time) missing.push('time');
    if (!bookingInfo.name) missing.push('name');
    if (!bookingInfo.mobile) missing.push('phone number');
    
    let responseContent = '';
    
    // Handle availability request
    if (step.userMessage.toLowerCase().includes('available') || step.userMessage.toLowerCase().includes('times')) {
      if (bookingInfo.date && bookingInfo.persons) {
        const formattedDate = formatDate(bookingInfo.date);
        const availability = await checkAvailability(formattedDate, bookingInfo.persons);
        
        if (availability.success) {
          const { dayStatus, onlineBooking, availabilityTimes } = availability.data;
          
          if (!dayStatus) {
            responseContent = "I'm sorry, the restaurant is closed on that date. Could you try a different date?";
          } else if (!onlineBooking) {
            responseContent = "Online booking is not available for that date. Please call the restaurant directly to make a reservation.";
          } else {
            responseContent = formatAvailableTimesForSpeech(availabilityTimes);
          }
        } else {
          responseContent = "I'm having trouble checking availability right now. Could you try again or call us directly?";
        }
      } else {
        responseContent = "I'd be happy to check availability. Please tell me the date and how many people will be dining.";
      }
    } else if (missing.length === 0) {
      // All information collected
      responseContent = `Perfect! I have all the information for your reservation. Let me confirm: ${bookingInfo.persons} people on ${bookingInfo.date} at ${bookingInfo.time} under the name ${bookingInfo.name}. I'll process this reservation now.`;
    } else {
      // Ask for missing information
      if (missing.includes('party size')) {
        responseContent = "How many people will be dining with us?";
      } else if (missing.includes('date')) {
        responseContent = "What date would you like to make the reservation for?";
      } else if (missing.includes('time')) {
        responseContent = "What time would you prefer for your reservation?";
      } else if (missing.includes('name')) {
        responseContent = "Great! I have the details for your reservation. Could I get your name please?";
      } else if (missing.includes('phone number')) {
        responseContent = "And could I get your phone number for the reservation?";
      }
    }
    
    console.log(`   Bot: "${responseContent}"`);
    console.log(`   Current Info: persons=${bookingInfo.persons}, date=${bookingInfo.date}, time=${bookingInfo.time}, name=${bookingInfo.name}, mobile=${bookingInfo.mobile}`);
    
    if (missing.length > 0) {
      console.log(`   Missing: ${missing.join(', ')}`);
    }
    
    console.log('');
  }
  
  // Final booking attempt
  console.log('🎯 Final Booking Attempt:');
  
  if (bookingInfo.persons && bookingInfo.date && bookingInfo.time && bookingInfo.name && bookingInfo.mobile) {
    const finalBookingData = {
      date: formatDate(bookingInfo.date),
      time: formatTime(bookingInfo.time) || bookingInfo.time,
      persons: bookingInfo.persons,
      name: bookingInfo.name,
      mobile: bookingInfo.mobile,
      comment: 'Booking made via Retell AI phone system'
    };
    
    console.log('   📋 Final booking data:', JSON.stringify(finalBookingData, null, 2));
    
    // Validate the booking payload
    try {
      const response = await fetch('http://localhost:3000/api/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          payload: {
            externalID: `retell-${Date.now()}`,
            date: finalBookingData.date,
            time: finalBookingData.time,
            persons: finalBookingData.persons,
            name: finalBookingData.name,
            mobile: finalBookingData.mobile,
            comment: finalBookingData.comment,
            autoTable: true,
            emailNotifications: 1,
            smsNotifications: 1
          }
        })
      });
      
      const result = await response.json();
      
      if (result.valid) {
        console.log('   ✅ Booking payload is valid and ready to submit');
        console.log('   🎉 Conversation flow completed successfully!');
      } else {
        console.log('   ❌ Booking payload validation failed:', result.errors);
      }
      
    } catch (error) {
      console.log('   ❌ Validation test failed:', error.message);
    }
    
  } else {
    console.log('   ❌ Missing required information for booking');
  }
  
  console.log('\n✅ Retell conversation simulation complete!');
}

simulateRetellConversation().catch(console.error); 