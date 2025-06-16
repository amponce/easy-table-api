# Retell AI Integration for Restaurant Reservations

This middleware integrates your EasyTable restaurant booking system with Retell AI for voice-based reservations.

## Setup

1. **Get your Retell AI API Key**:
   - Sign up at [Retell AI](https://retell.ai)
   - Get your API key from the dashboard
   - Add it to your `.env` file:
     ```
     RETELL_API_KEY=your_retell_api_key_here
     ```

2. **Configure your Retell AI Agent**:
   - In your Retell dashboard, create a new agent
   - Set the webhook URL to: `https://your-domain.com/api/retell-webhook`
   - Configure the agent's voice and personality as desired

## Available Endpoints

### Main Webhook Endpoint
- **POST** `/api/retell-webhook`
- Handles all Retell AI conversation events
- Manages the full conversation flow for making reservations

### Direct API Endpoints
- **POST** `/api/retell-availability` - Check table availability
- **POST** `/api/retell-booking` - Create a booking directly

## How It Works

1. **Call Flow**:
   - Customer calls your Retell AI phone number
   - AI greets them and asks for party size
   - Collects: date, time, name, phone number
   - Checks availability using your existing EasyTable API
   - Creates the booking if all information is valid
   - Confirms the reservation details

2. **Data Processing**:
   - Extracts booking information from natural conversation
   - Formats dates and times appropriately
   - Uses your existing EasyTable API credentials
   - Creates bookings with "Retell AI" identifier

## Example API Calls

### Check Availability
```bash
curl -X POST https://your-domain.com/api/retell-availability \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2024-06-20",
    "persons": 4
  }'
```

### Create Booking
```bash
curl -X POST https://your-domain.com/api/retell-booking \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2024-06-20",
    "time": "19:00",
    "persons": 4,
    "name": "John Doe",
    "mobile": "1234567890",
    "comment": "Window seat if possible"
  }'
```

## Conversation Examples

**Customer**: "Hi, I'd like to make a reservation"
**AI**: "Hello! Welcome to our restaurant. I can help you make a reservation. How many people will be dining with us?"

**Customer**: "Four people for tonight at 7 PM"
**AI**: "Perfect! Let me check availability for 4 people tonight at 7 PM... I have 7:00 PM available. Could I get your name please?"

**Customer**: "John Smith"
**AI**: "Great! And could I get your phone number for the reservation?"

**Customer**: "555-123-4567"
**AI**: "Perfect! I've successfully made your reservation for 4 people tonight at 7:00 PM under the name John Smith. You'll receive a confirmation via text message."

## Features

- ✅ Natural language processing for booking details
- ✅ Real-time availability checking
- ✅ Automatic booking creation
- ✅ SMS/Email confirmations via EasyTable
- ✅ Handles date/time parsing ("tonight", "tomorrow", "7 PM", etc.)
- ✅ Validates all required information before booking
- ✅ Error handling for failed bookings
- ✅ Webhook signature verification for security

## Testing

1. Start your server: `npm run server`
2. Use ngrok or similar to expose your local server
3. Configure your Retell agent webhook URL
4. Test by calling your Retell AI phone number

## Security

- Webhook signatures are verified using your Retell API key
- All booking data is validated before processing
- Uses the same secure EasyTable API integration as your existing system

## Troubleshooting

- Check that `RETELL_API_KEY` is set in your `.env` file
- Ensure your webhook URL is publicly accessible
- Verify EasyTable credentials are working with existing endpoints
- Check server logs for detailed error messages

