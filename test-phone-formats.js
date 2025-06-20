import 'dotenv/config';
import axios from 'axios';
import chalk from 'chalk';

const API_KEY = process.env.EASYTABLE_API_KEY?.trim();
const PLACE_TOKEN = process.env.EASYTABLE_PLACE_TOKEN?.trim();

if (!API_KEY || !PLACE_TOKEN) {
  console.error(chalk.red('❌ Missing EASYTABLE_API_KEY or EASYTABLE_PLACE_TOKEN'));
  process.exit(1);
}

// Test different phone number formats (based on your requirements)
const phoneFormats = [
  { format: 'US digits only (current working)', mobile: '15551234567' },
  { format: 'Danish digits only', mobile: '4512345678' },
  { format: 'Danish with +45', mobile: '+4512345678' },
  { format: 'Danish with spaces', mobile: '+45 12 34 56 78' }
];

async function testPhoneFormat(testCase) {
  const payload = {
    externalID: `phone-test-${Date.now()}`,
    persons: 2,
    name: 'Test User',
    mobile: testCase.mobile,
    comment: `Testing ${testCase.format}`,
    autoTable: true,
    emailNotifications: 1,
    smsNotifications: 1,
    date: '2025-01-20',
    time: '20:00'
  };

  console.log(chalk.cyan(`\n🧪 Testing ${testCase.format}: "${testCase.mobile}"`));

  try {
    const { data, status } = await axios.post(
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

    console.log(chalk.green(`✅ ACCEPTED: ${testCase.format} - HTTP ${status}`));
    return { success: true, format: testCase.format, mobile: testCase.mobile };
  } catch (error) {
    if (error.response) {
      console.log(chalk.red(`❌ REJECTED: ${testCase.format} - HTTP ${error.response.status}`));
      if (error.response.data) {
        console.log(chalk.gray(`   Error details: ${JSON.stringify(error.response.data)}`));
      }
    } else {
      console.log(chalk.red(`❌ ERROR: ${testCase.format} - ${error.message}`));
    }
    return { success: false, format: testCase.format, mobile: testCase.mobile };
  }
}

console.log(chalk.yellow('🔍 Testing EasyTable API Phone Format Compatibility\n'));

// Test formats one by one
for (const testCase of phoneFormats) {
  const result = await testPhoneFormat(testCase);
  
  // Wait between tests to avoid rate limiting
  await new Promise(resolve => setTimeout(resolve, 2000));
}

console.log(chalk.cyan('\n✅ Phone format testing complete!')); 