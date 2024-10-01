import Razorpay from "razorpay";
import dotenv from "dotenv"

dotenv.config();

const razorpayInstance = new Razorpay({
  key_id: process.env.RZP_KEY_ID,
  key_secret: process.env.RZP_SECRET_KEY,
});

export default razorpayInstance;