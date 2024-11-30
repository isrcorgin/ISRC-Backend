import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import cors from 'cors';
import jwt from "jsonwebtoken"
import bodyParser from 'body-parser';
import crypto from 'crypto';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import verifyToken from './middleware/authToken.js';
import adminRouter from './routes/admin-routes.js';

import {
  auth,
  storage,
  database,
  uploadBytes,
  getDownloadURL,
  ref,
  dbRef,
  push,
  set,
  get,
  deleteObject,
  serverTimestamp,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
} from './config/firebase-config.js';
import razorpayInstance from './config/razorpay-config.js';
import markingRouter from './routes/marking-routes.js';
import generateTeamCertificates from './utils/generateTeamMembersCertificate.js';
import formRouter from './routes/awardForm-routes.js';
import sessionFormRouter from './routes/session-routes.js';
import givenRouts from './routes/gio-routes.js';
import internshipFormRouter from './routes/internship-routes.js';
import certificationFormRouter from './routes/certification-routes.js';


// load .env
dotenv.config()

const server = express();
// Trust the first proxy
server.set("trust proxy", 1);
const upload = multer({ storage: multer.memoryStorage() });

server.use(cors());
server.use(express.json()); // Built-in body-parser for JSON
server.use(express.urlencoded({ extended: true })); // Built-in body-parser for URL-encoded data
server.use(bodyParser.json());

// API Security
server.use(helmet());

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Limit each IP to 100 requests per windowMs
  message: "Too many requests, please try again later.",
});

// Apply global limiter to all requests
server.use(globalLimiter);

// Authentication-specific limiter
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Limit each IP to 10 requests per windowMs
  message: "Too many authentication attempts, please try again later.",
});

// Payment-specific limiter
const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // Limit each IP to 5 requests per windowMs
  message: "Too many payment attempts, please try again later.",
});

// admin routes 
server.use("/api/admin", adminRouter);

// marking routes
server.use("/api/marking", markingRouter);

// form routes
server.use("/api/forms", formRouter)
server.use("/api/sessionForm",sessionFormRouter)
server.use("/api/gio-event",givenRouts)
server.use("/api/intern-form", internshipFormRouter)
server.use('/api/certificationForm', certificationFormRouter);
server.get("/", (req, res) => {
  res.send("App is working");
});

// Register the User
server.post("/api/register", authLimiter, async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and Password are required" });
  }

  try {
    // Register the user with Firebase Auth
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Store user information in Firestore
    await set(dbRef(database, `users/${user.uid}`), {
      uid: user.uid,
      email: user.email,
    });

    // Send email verification
    await sendEmailVerification(user);

    // Generate a token for the user
    const token = jwt.sign({ uid: user.uid }, process.env.JWT_SECRET);

    // Respond with a message indicating the verification email has been sent
    res.status(200).json({
      message: "Registration successful. A verification email has been sent.",
      token,
      emailVerified: user.emailVerified
    });
  } catch (error) {
    if (error.code === "auth/email-already-in-use") {
      res.status(400).json({ message: "Email is already in use" });
    } else {
      console.error("Error registering user:", error);
      res.status(500).json({ message: "Error registering user", error });
    }
  }
});
// Login the User
server.post("/api/login", authLimiter, async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and Password are required" });
  }

  try {
    const userCredential = await signInWithEmailAndPassword(
      auth,
      email,
      password
    );
    const user = userCredential.user;

    const token = jwt.sign({ uid: user.uid }, process.env.JWT_SECRET);

    res.status(200).json({ message: "Login successful", token, emailVerified: user.emailVerified });
  } catch (error) {
    res.status(500).json({ message: "Error logging in", error });
  }
});

// Forgot the Reset Password
server.post("/api/forgot-password", authLimiter, async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: "Email is Required" });
  }

  try {
    await sendPasswordResetEmail(auth, email);
    res.status(200).json({ message: "Password reset email sent successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error sending password reset email", error });
  }
});


// Get the user Data
server.get("/api/user-profile", verifyToken, async (req, res) => {
  const uid = req.user.uid;

  try {
    const userRef = dbRef(database, `users/${uid}`);
    const userSnapshot = await get(userRef);

    if (userSnapshot.exists()) {
      const userData = userSnapshot.val();
      res.status(200).json({ message: "User profile sent", user: userData });
    } else {
      res.status(404).json({ message: "User not found" });
    }
  } catch (error) {
    console.log(error)
    res.status(500).json({ message: "Internal Server Error" });
  }
});




// Team registration form
server.post("/api/register-team", verifyToken, async (req, res) => {
  const { uid } = req.user;
  const { formDetails, teamMembers } = req.body;

  if (!formDetails || !teamMembers) {
    return res.status(400).json({ error: "Missing team details" });
  }

  try {
    // Reference to the user data
    const userRef = dbRef(database, `users/${uid}`);

    // Fetch the existing user data
    const userSnapshot = await get(userRef);
    const userData = userSnapshot.val();

    if (!userData) {
      return res.status(404).json({ error: "User not found" });
    }

    // Update only the team details, preserving the existing email
    await set(userRef, {
      ...userData, // Preserve existing data including email
      team: {
        teamName: formDetails.teamName,
        country: formDetails.country,
        competitionTopic: {
          ageGroup: formDetails.ageGroup,
          topic: formDetails.topic,
          category: formDetails.category,
        },
        mentor: {
          name: formDetails.mentorName,
          age: formDetails.mentorAge,
          email: formDetails.mentorEmail,
          phone: formDetails.mentorPhone,
          WhatsApp: formDetails.mentorWhatsApp
        },
        members: teamMembers,
      },
      teamRegistered: true,
      paymentStatus: "pending",
      amountDue: formDetails.amountDue,
    });

    res.status(200).json({ message: "Team registered successfully" });
  } catch (error) {
    console.error("Error registering team:", error);
    res.status(500).json({ error: "Error registering team" });
  }
});

// Route to update the profile Image of the members
server.post("/api/upload-profile-image", verifyToken, upload.single("profileImage"), async (req, res) => {
  const { uid } = req.user;
  const { memberName } = req.body;
  const file = req.file;

  if (!memberName || !file) {
    return res.status(400).json({ message: "Member name and profile image are required" });
  }

  try {
    // Find the user based on uid
    const userRef = dbRef(database, `users/${uid}`);
    const userSnapshot = await get(userRef);

    if (!userSnapshot.exists()) {
      return res.status(404).json({ message: "User not found" });
    }

    const userData = userSnapshot.val();
    const teamMembers = userData.team?.members || [];
    let memberFound = false;

    // Search for the member by name
    for (const member of teamMembers) {
      if (member.name.toLowerCase() === memberName.toLowerCase()) {
        // Check if there is an existing profile image and delete it
        if (member.profileImageUrl) {
          // Extract the image path from the URL
          const encodedImagePath = member.profileImageUrl.split('/o/')[1].split('?')[0]; // URL-encoded path
          const imagePath = decodeURIComponent(encodedImagePath); // Decode the URL-encoded path

          // Create a reference to the image in Firebase Storage
          const imageRef = ref(storage, imagePath);

          // Delete the image from Firebase Storage
          await deleteObject(imageRef);
        }

        // Optimize the image using sharp
        const optimizedBuffer = await sharp(file.buffer)
          .resize(300, 300) // Resize the image to 300x300 pixels
          .jpeg({ quality: 80 }) // Convert to JPEG with 80% quality
          .toBuffer();

        // Upload the optimized profile image to Firebase Storage
        const storageRef = ref(storage, `profile-images/${Date.now()}-${file.originalname}`);
        const snapshot = await uploadBytes(storageRef, optimizedBuffer);
        const downloadURL = await getDownloadURL(snapshot.ref);

        // Update the member's profile image URL in the database
        member.profileImageUrl = downloadURL;

        // Save the updated user data
        await set(userRef, userData);

        memberFound = true;
        res.status(200).json({ message: "Profile image updated successfully", downloadURL });
        break;
      }
    }

    if (!memberFound) {
      res.status(404).json({ message: "Member not found" });
    }
  } catch (error) {
    console.error("Error updating profile image:", error);
    res.status(500).json({ message: "Error updating profile image", error });
  }
});

// Payment Gateway
server.post("/api/payment", paymentLimiter, (req, res) => {
  const { amount } = req.body;

  if (!amount) {
    return res.status(400).json({
      statusCode: 400,
      error: {
        code: "BAD_REQUEST_ERROR",
        description: "amount: is required.",
        metadata: {},
        reason: "input_validation_failed",
        source: "business",
        step: "payment_initiation",
      },
    });
  }

  try {
    const options = {
      amount: Number(amount) * 100,
      currency: "INR",
      receipt: crypto.randomBytes(10).toString("hex"),
    };

    razorpayInstance.orders.create(options, (err, order) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: "Failed to create order" });
      }
      return res.status(200).json({ data: order });
    });
  } catch (error) {
    res.status(500).json({ message: "Internal Server Error" });
    console.log(error);
  }
});

// Payment Verification
server.post("/api/verify", verifyToken, paymentLimiter, async (req, res) => {
  const { uid } = req.user;
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount } = req.body;

  try {
    if (
      !uid ||
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature
    ) {
      return res.status(400).json({ message: "Missing required parameters" });
    }

    // Create sign string by concatenating order_id and payment_id
    const sign = razorpay_order_id + "|" + razorpay_payment_id;

    // Create ExpectedSign by hashing the sign string with the Razorpay secret key
    const expectedSign = crypto
      .createHmac("sha256", process.env.RZP_SECRET_KEY)
      .update(sign)
      .digest("hex");

    // Compare the expectedSign with the received signature
    const paymentVerified = expectedSign === razorpay_signature;

    if (paymentVerified) {
      // Save payment data to Firebase Realtime Database only if payment is verified
      const userRef = dbRef(database, `users/${uid}`);

      // Fetch existing user data
      const userSnapshot = await get(userRef);
      const userData = userSnapshot.val();

      if (userData) {
        // Update user data with payment details directly in payments
        const updatedUserData = {
          ...userData,
          teamRegistered: true,
          paymentStatus: "completed",
          amountDue: 0, // Set amount due to 0 to avoid unnecessary updates
          payments: {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            amount,
          },
        };

        // Update user data with payment details
        await set(userRef, updatedUserData);

        await generateTeamCertificates(userData)
      }

      // Send success response
      return res.status(200).json({ message: "Payment verified and saved successfully" });
    } else {
      // Payment verification failed
      return res.status(400).json({ message: "Payment verification failed" });
    }
  } catch (error) {
    console.error("Payment verification error:", error); // Log error details for troubleshooting
    return res.status(500).json({ message: "Internal Server Error" });
  }
});
// Resend Email Verification Endpoint
server.post('/api/resend-verification', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  try {

    // Sign in the user with email and password to get the user credential
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Check if the email is already verified
    if (user.emailVerified) {
      return res.status(400).json({ message: 'Email is already verified' });
    }

    // Now that the user is authenticated, query the Realtime Database
    const usersRef = dbRef(database, 'users');
    const snapshot = await get(usersRef);

    if (!snapshot.exists()) {
      return res.status(404).json({ message: 'No users found' });
    }

    const usersData = snapshot.val();
    const userKey = Object.keys(usersData).find(key => usersData[key].email === email);

    if (!userKey) {
      return res.status(404).json({ message: 'User not found in database' });
    }

    // Send email verification
    await sendEmailVerification(user);

    res.status(200).json({ message: 'Verification email sent successfully' });

  } catch (error) {
    console.error('Error resending verification email:', error);
    res.status(500).json({ message: 'Error resending verification email', error });
  }
});
// Get the User Details

// Check the Team Name Uniqueness
server.get("/api/check-team-name", verifyToken, async (req, res) => {
  const { teamName } = req.query;

  if (!teamName) {
    return res.status(400).json({ message: "Team name is required" });
  }

  try {
    const usersRef = dbRef(database, "users");
    const snapshot = await get(usersRef);

    if (snapshot.exists()) {
      const data = snapshot.val();
      const teamNames = Object.values(data)
        .map((user) => user.team?.teamName?.toLowerCase())
        .filter(Boolean);

      if (teamNames.includes(teamName.toLowerCase())) {
        return res.status(200).json({ exists: true });
      }
    }

    res.status(200).json({ exists: false });
  } catch (error) {
    console.error("Error checking team name:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// Check the verification Email
server.post("/api/check-verification", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and Password are required" });
  }

  try {
    const userCredential = await signInWithEmailAndPassword(
      auth,
      email,
      password
    );
    const user = userCredential.user;

    if (user.emailVerified) {
      res.status(200).json({ message: "Email is verified" });
    } else {
      res.status(200).json({ message: "Email is not verified" });
    }
  } catch (error) {
    console.error("Error checking email verification:", error);
    res
      .status(500)
      .json({ message: "Error checking email verification", error });
  }
});

// Admin panel route - upload Auth code and certificate (At the Moment Not in Use)
server.post("/api/upload", upload.single("certificate"), async (req, res) => {
  const { authCode } = req.body;
  const file = req.file;

  if (!authCode || !file) {
    return res
      .status(400)
      .json({ message: "Auth Code and Certificate are required" });
  }

  try {
    // Upload file to Firebase Storage
    const storageRef = ref(
      storage,
      `certificates/${Date.now()}-${file.originalname}`
    );
    const snapshot = await uploadBytes(storageRef, file.buffer);
    const downloadURL = await getDownloadURL(snapshot.ref);

    // Save Auth Code and file URL to Firebase Realtime Database
    const newUploadRef = push(dbRef(database, "certificates"));

    await set(newUploadRef, {
      id: newUploadRef.key,
      authCode,
      certificateUrl: downloadURL,
      uploadedAt: serverTimestamp(),
    });

    res.status(200).json({ message: "Upload successful", downloadURL });
  } catch (error) {
    console.error("Error uploading file:", error);
    res.status(500).json({ message: "Error uploading file", error });
  }
});

// Second Route: Verify Certificate
server.post("/api/verify-certificate", async (req, res) => {
  const { authCode } = req.body;

  if (!authCode) {
    return res.status(400).json({ message: "Auth Code is required" });
  }

  try {
    // Reference to the 'certificates' collection in Firebase Realtime Database
    const certificatesRef = dbRef(database, "certificates");

    // Fetch all child nodes under 'certificates'
    const snapshot = await get(certificatesRef);

    if (snapshot.exists()) {
      const data = snapshot.val();

      // Iterate through the children to find a matching authCode
      for (const key in data) {
        if (data[key].authCode === authCode) {
          // Return the entire certificate object
          return res.status(200).json({ data: data[key] });
        }
      }

      // If no matching authCode is found
      return res.status(404).json({ message: "No record found for this Auth Code" });
    } else {
      return res.status(404).json({ message: "No records found in the database" });
    }
  } catch (error) {
    console.error("Error fetching data:", error);
    return res.status(500).json({ message: "Error fetching data", error });
  }
});

// Register the Campus Ambassador
server.post("/api/campus-ambassador", async (req, res) => {
  const {
    name,
    email,
    phone,
    state,
    city,
    college,
    yearOfStudy,
    degreeProgram,
  } = req.body;

  if (
    !name ||
    !email ||
    !phone ||
    !state ||
    !city ||
    !college ||
    !yearOfStudy ||
    !degreeProgram
  ) {
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    // Save the Campus Ambassador details to Firebase Realtime Database
    const newCampusAmbassadorRef = push(dbRef(database, "campus-ambassadors"));
    await set(newCampusAmbassadorRef, {
      name,
      email,
      phone,
      state,
      city,
      college,
      yearOfStudy,
      degreeProgram,
      createdAt: new Date().toISOString(),
    });
    res
      .status(200)
      .json({ message: "Campus Ambassador registered successfully" });
  } catch (error) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
