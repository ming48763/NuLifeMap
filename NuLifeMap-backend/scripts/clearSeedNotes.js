require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/NuLifeMapDB';
  await mongoose.connect(uri, { dbName: process.env.MONGO_DB_NAME || 'NuLifeMapDB' });
  const col = mongoose.connection.collection('markers');
  const seed = 'Mai Job 種子資料';
  const r1 = await col.updateMany({ 'jobInfo.notes': seed }, { $set: { 'jobInfo.notes': '' } });
  const r2 = await col.updateMany({ 'houseInfo.notes': seed }, { $set: { 'houseInfo.notes': '' } });
  console.log(`job cleared ${r1.modifiedCount}, housing cleared ${r2.modifiedCount}`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try { await mongoose.disconnect(); } catch { /* ignore */ }
  process.exit(1);
});
