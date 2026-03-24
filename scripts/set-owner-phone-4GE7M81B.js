require('dotenv').config();

const { encrypt } = require('../utils/encryption');
const { supabase } = require('../utils/supabase');

async function main() {
  const uid = '4GE7M81B';
  const plainPhone = '+918896612173';

  try {
    const encrypted = encrypt(plainPhone);

    const { error } = await supabase
      .from('tags')
      .update({ owner_phone_encrypted: encrypted })
      .eq('uid', uid);

    if (error) {
      // eslint-disable-next-line no-console
      console.error('Update error:', error);
      process.exit(1);
    }

    // eslint-disable-next-line no-console
    console.log(`Updated owner_phone_encrypted for uid ${uid}`);
    process.exit(0);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Fatal error:', e);
    process.exit(1);
  }
}

main();

