import express from 'express';
import { dbRef, push, set, database, get,update } from '../config/firebase-config.js'; // Adjust imports based on your setup
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';

import verifyToken from '../middleware/authToken.js';

import razorpayInstance from '../config/razorpay-config.js';

const givenRouts = express.Router();

const paymentLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 30, // Limit each IP to 5 requests per windowMs
    message: "Too many payment attempts, please try again later.",
  });


  async function isUserAlreadyRegistered(userId) {
    try {
        const userRef = dbRef(database, `gio-event/${userId}`);
        const snapshot = await get(userRef);
        
        if (snapshot.exists()) {
            return true; // User has already submitted
        }
        return false; // No data for this user
    } catch (error) {
        console.error('Error checking registration:', error);
        throw new Error('Failed to check registration status');
    }
}



//route to submit form with uid 

givenRouts.post('/submit-gio-form', verifyToken, async (req, res) => {
    const formData = req.body; // Extract form data from the request body
    const userId = req.user.uid; // Extract UID from the verified token

    try {
        // Validate the form data (add specific field checks as needed)
        if (!formData || Object.keys(formData).length === 0) {
            return res.status(400).json({ message: 'Form data is missing or empty' });
        }

        // Add the userId to the formData to link the form submission with the user
        const formWithUserId = {
            ...formData,
            isregisterd: true,
        };

        // Reference to the "gio-event" node in the database using userId
        const userSessionFormRef = dbRef(database, `gio-event/${userId}`);

        // Storing form data in the database under the user's UID
        await set(userSessionFormRef, formWithUserId);

        res.status(200).json({ message: 'Global Innovator Olympiad form submitted successfully!' });
    } catch (error) {
        console.error('Error submitting GIO form:', error);
        res.status(500).json({ message: 'Failed to submit Global Innovator Olympiad form', error: error.message });
    }
});


givenRouts.get('/check-registration-status', verifyToken, async (req, res) => {
    const userId = req.user.uid; // Extract UID from the verified token
    
    try {
        // Check if the user is already registered
        const alreadyRegistered = await isUserAlreadyRegistered(userId);

        if (alreadyRegistered) {
            return res.status(200).json({ registered: true, message: 'User is already registered.' });
        } else {
            return res.status(200).json({ registered: false, message: 'User is not registered.' });
        }
    } catch (error) {
        console.error('Error checking registration status:', error);
        // Send an error response
        res.status(500).json({ 
            message: 'Failed to check registration status', 
            error: error.message 
        });
    }
});

// Route to get all submitted session forms
givenRouts.get('/get-Global-innovator-olympiad', verifyToken,async (req, res) => {
    try {
        // Reference to the "SessionForms" node in the database
    const { uid } = req.user;

        const sessionFormsRef = dbRef(database, 'gio-event');

        // Retrieve all session forms
        const snapshot = await get(sessionFormsRef);

        if (snapshot.exists()) {
            // Convert snapshot to JSON
            const sessionForms = snapshot.val();
            res.status(200).json(sessionForms);
        } else {
            res.status(404).json({ message: 'No session forms found' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Failed to retrieve session forms', error: error.message });
    }
});


givenRouts.get('/get-gio-profile', verifyToken, async (req, res) => {
    try {
        // Extract user ID (uid) from the request
        const { uid } = req.user;

        // Reference to the user's entry in the "gio-event" node in the database
        const userSessionFormRef = dbRef(database, `gio-event/${uid}`);

        // Retrieve the user's session form
        const snapshot = await get(userSessionFormRef);

        if (snapshot.exists()) {
            // Convert snapshot to JSON
            const userForm = snapshot.val();
            
            res.status(200).json(userForm);
        } else {
            res.status(404).json({ message: 'No forms found for this user' });
        }
    } catch (error) {
        console.error('Error retrieving session forms:', error);
        res.status(500).json({ message: 'Failed to retrieve session forms', error: error.message });
    }
});


//create payment initialize
givenRouts.post("/gio-payment/create", paymentLimiter, verifyToken, async (req, res) => {
  const { amount } = req.body;
  const userId = req.user.uid;

  // Validate amount
  if (!amount) {
    return res.status(400).json({
      statusCode: 400,
      error: {
        code: "BAD_REQUEST_ERROR",
        description: "amount: is required.",
        reason: "input_validation_failed",
        source: "business",
        step: "payment_initiation",
      },
    });
  }

  try {
    // Prepare options for Razorpay
    const options = {
      amount: Number(amount) * 100, // Convert to paise
      currency: "INR",
      receipt: crypto.randomBytes(10).toString("hex"),
    };

    // Create order with Razorpay
    razorpayInstance.orders.create(options, async (err, order) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: "Failed to create order" });
      }

      // Prepare payment details
      const paymentDetails = {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        receipt: order.receipt,
        status: order.status,
        createdAt: new Date(order.created_at * 1000), // Convert timestamp to JavaScript date
        isPaid: false, // Set to false initially until confirmed
      };

      // Store payment details under user's node
      try {
        const userPaymentsRef = dbRef(database, `gio-event/${userId}/payments/${order.id}`); // Use order.id as key
        await set(userPaymentsRef, paymentDetails); // Store payment details

        return res.status(200).json({ data: order });
      } catch (dbError) {
        console.error("Database Error: ", dbError);
        return res.status(500).json({ error: "Failed to save payment details in database" });
      }
    });
  } catch (error) {
    console.error('Internal Server Error:', error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});


//confirm and updates in db 
givenRouts.post("/gio-payment/confirm", paymentLimiter, verifyToken, async (req, res) => {
    const { razorpay_order_id, razorpay_payment_id } = req.body;
    const userId = req.user.uid; // Extract UID from the verified token
  
    // Validate required parameters
    if (!razorpay_order_id || !razorpay_payment_id) {
      return res.status(400).json({
        statusCode: 400,
        error: {
          code: "BAD_REQUEST_ERROR",
          description: "razorpay_order_id and razorpay_payment_id are required.",
          reason: "input_validation_failed",
          source: "business",
          step: "payment_confirmation",
        },
      });
    }
  
    try {
      // Prepare payment details
      const paymentDetails = {
        razorpay_order_id,
        razorpay_payment_id,
        isPaid: true, // Mark as paid
        paidAt: new Date(),
        canAttempt:true,
      };
  
      // Find the payment node in the database using the Razorpay order ID
      const paymentRef = dbRef(database, `gio-event/${userId}/payments/${razorpay_order_id}`);
      await update(paymentRef, paymentDetails); // Update payment status
  
      return res.status(200).json({
        status: "Payment confirmed successfully",
        razorpay_order_id,
        razorpay_payment_id,
      });
    } catch (dbError) {
      console.error("Database Error: ", dbError);
      return res.status(500).json({ error: "Failed to confirm payment in database" });
    }
  });
  

// givenRouts.post("/getpaymentstatus",verifyToken,async(Req,res)=>{
//     try {
        
//     } catch (error) {
        
//     }
// })

givenRouts.get('/canattempt', verifyToken, async (req, res) => {
    const userId = req.user.uid;
  
    try {
      // Reference to the payments node for the user
      const paymentsRef = dbRef(database, `gio-event/${userId}/payments`);
      
      // Fetch all payment entries
      const snapshot = await get(paymentsRef);
      
      // If no payment node exists, assume user hasn't paid
      if (!snapshot.exists()) {
        return res.status(200).json({ canAttempt: false, hasPaid: false });
      }
  
      const payments = snapshot.val();
      let canAttempt = false;
      // Check if any payment node has canAttempt set to true
      for (const key in payments) {
        if (payments[key].canAttempt === true) {
          canAttempt = true;
          break; // If any node has canAttempt as true, stop further iteration
        }
      }


      // If there are payment nodes but none allows attempting
      return res.status(200).json({ canAttempt });
    } catch (error) {
      console.error("Error checking payment status: ", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  


  

givenRouts.post("/getUserStd", verifyToken, async (req, res) => {
    try {
        // Extract user ID (uid) from the request
        const { uid } = req.user;

        // Reference to the user's profile in the database
        const userProfileRef = dbRef(database, `gio-event/${uid}`);

        // Retrieve the user's profile
        const snapshot = await get(userProfileRef);

        if (snapshot.exists()) {
            const userProfile = snapshot.val();

            // Assuming the standard is stored in a field called 'std'
            if (userProfile.std) {
                res.status(200).json({ std: userProfile.std });
            } else {
                res.status(404).json({ message: 'Standard not found for this user' });
            }
        } else {
            res.status(404).json({ message: 'User profile not found' });
        }
    } catch (error) {
        console.error('Error retrieving user standard:', error);
        res.status(500).json({ message: 'Failed to retrieve user standard', error: error.message });
    }
});


givenRouts.post("/storeMarks", verifyToken, async (req, res) => {
  try {
    // Extract user ID (uid) from the request
    const { uid } = req.user;

    // Extract marks from the request body and ensure it's a number
    const { marks } = req.body;
    const numericMarks = Number(marks);

    if (isNaN(numericMarks)) {
      return res.status(400).json({ message: 'Marks must be a number' });
    }

    // Reference to the user's profile in the database
    const userProfileRef = dbRef(database, `gio-event/${uid}`);

    // Retrieve the user's profile
    const snapshot = await get(userProfileRef);

    if (!snapshot.exists()) {
      return res.status(404).json({ message: 'User profile not found' });
    }

    const userData = snapshot.val();
    const existingMarks = userData.marks;

    // Flag to indicate if marks were updated
    let marksUpdated = false;

    // Check if existing marks are present and compare
    if (existingMarks !== undefined && existingMarks !== null) {
      if (numericMarks > existingMarks) {
        // Update marks if new marks are higher
        await set(dbRef(database, `gio-event/${uid}/marks`), numericMarks);
        marksUpdated = true;
      } else {
      }
    } else {
      // If no existing marks, store the new marks
      await set(dbRef(database, `gio-event/${uid}/marks`), numericMarks);
      marksUpdated = true;
    }

    // Proceed to update payments regardless of marks update
    const paymentsRef = dbRef(database, `gio-event/${uid}/payments`);
    const paymentsSnapshot = await get(paymentsRef);

    if (!paymentsSnapshot.exists()) {
      return res.status(200).json({
        message: marksUpdated 
          ? 'Marks updated and no payments to update' 
          : 'Marks not updated and no payments to update'
      });
    }

    const paymentsData = paymentsSnapshot.val();
    if (!paymentsData) {
      return res.status(200).json({
        message: marksUpdated 
          ? 'Marks updated and no payment data to update' 
          : 'Marks not updated and no payment data to update'
      });
    }

    let shouldUpdateFlags = false;

    // Check if any payment has canAttempt=true and isPaid=true
    for (const payment of Object.values(paymentsData)) {
      if (payment.canAttempt === true && payment.isPaid === true) {
        shouldUpdateFlags = true;
        break; // Exit loop on first true found
      }
    }

    if (shouldUpdateFlags) {
      const updates = {};
      for (const paymentId in paymentsData) {
        if (paymentsData.hasOwnProperty(paymentId)) {
          updates[`${paymentId}/canAttempt`] = false;
        }
      }
      // Perform a multi-update
      await update(paymentsRef, updates);
      return res.status(200).json({
        message: marksUpdated 
          ? 'Marks updated and payment status updated successfully' 
          : 'Marks not updated but payment status updated successfully'
      });
    } else {
      return res.status(200).json({
        message: marksUpdated 
          ? 'Marks updated and no payment flags needed updating' 
          : 'Marks not updated and no payment flags needed updating'
      });
    }

  } catch (error) {
    console.error('Error storing marks:', error);
    res.status(500).json({ message: 'Failed to store marks', error: error.message });
  }
});



givenRouts.post("/storeMockMarks", verifyToken, async (req, res) => {
  try {
    // Extract user ID (uid) from the request
    const { uid } = req.user;
    
    // Extract marks from the request body and ensure it's a number
    const { marks } = req.body;
    const numericMarks = Number(marks);

    if (isNaN(numericMarks)) {
      console.warn("Invalid marks received:", marks);
      return res.status(400).json({ message: 'Marks must be a number' });
    }

    // Reference to the user's profile in the database
    const userProfileRef = dbRef(database, `gio-event/${uid}`);

    // Retrieve the user's profile
    const snapshot = await get(userProfileRef);

    if (!snapshot.exists()) {
      console.warn(`User profile not found for UID: ${uid}`);
      return res.status(404).json({ message: 'User profile not found' });
    }

    const userData = snapshot.val();
    const existingMockMarks = userData.Mockmarks; // Ensure consistency


    // Flag to indicate if marks were updated
    let marksUpdated = false;

    // Check if existing Mockmarks are present and compare
    if (existingMockMarks !== undefined && existingMockMarks !== null) {
      if (numericMarks > existingMockMarks) {
        await set(dbRef(database, `gio-event/${uid}/Mockmarks`), numericMarks);
        marksUpdated = true;
      } else {
      }
    } else {
      await set(dbRef(database, `gio-event/${uid}/Mockmarks`), numericMarks);
      marksUpdated = true;
    }

    // Respond based on whether marks were updated
    return res.status(200).json({
      message: marksUpdated 
        ? 'Mockmarks updated successfully' 
        : 'Mockmarks not updated, new marks are not higher'
    });

  } catch (error) {
    console.error('Error storing Mockmarks:', error);
    res.status(500).json({ message: 'Failed to store Mockmarks', error: error.message });
  }
});


givenRouts.get("/getMockRank", verifyToken, async (req, res) => {
  try {
    const { uid } = req.user;

    // Reference to the user's Mockmarks
    const userMarksRef = dbRef(database, `gio-event/${uid}/Mockmarks`);
    const userMarksSnapshot = await get(userMarksRef);

    if (!userMarksSnapshot.exists()) {
      return res.status(404).json({ message: 'User marks not found' });
    }

    const userMarks = userMarksSnapshot.val();

    // Generate random rank based on userMarks
    let rank;
    if (userMarks >= 80 && userMarks <= 100) {
      // Random 3-digit rank (from 100 to 999)
      rank = Math.floor(Math.random() * 900) + 100;
    } else if (userMarks >= 55 && userMarks <= 79) {
      // Random 4-digit rank (from 1000 to 9999)
      rank = Math.floor(Math.random() * 9000) + 1000;
    } else if (userMarks >= 25 && userMarks <= 54) {
      // Random 5-digit rank (from 10000 to 99999)
      rank = Math.floor(Math.random() * 90000) + 10000;
    } else if (userMarks < 25) {
      // Random 6-digit rank (from 100000 to 999999)
      rank = Math.floor(Math.random() * 900000) + 100000;
    } else {
      // Handle marks outside of 0-100 range
      return res.status(400).json({ message: 'Invalid marks' });
    }

    res.status(200).json({ rank });

  } catch (error) {
    console.error('Error getting rank:', error);
    res.status(500).json({ message: 'Failed to get rank', error: error.message });
  }
});

givenRouts.get("/getGlobalRank", verifyToken, async (req, res) => {
  // try {
  //   const { uid } = req.user;

  //   // Reference to the user's marks
  //   const userMarksRef = dbRef(database, `gio-event/${uid}/marks`);
  //   const userMarksSnapshot = await get(userMarksRef);

  //   if (!userMarksSnapshot.exists()) {
  //     return res.status(404).json({ message: 'User marks not found' });
  //   }

  //   const userMarks = Number(userMarksSnapshot.val());
  //   if (isNaN(userMarks)) {
  //     return res.status(400).json({ message: 'Invalid user marks' });
  //   }

  //   // Reference to all users' marks
  //   const allUsersRef = dbRef(database, 'gio-event');
  //   const allUsersSnapshot = await get(allUsersRef);

  //   if (!allUsersSnapshot.exists()) {
  //     return res.status(404).json({ message: 'No user marks found' });
  //   }

  //   const allUsersData = allUsersSnapshot.val();

  //   // Collect and validate all marks
  //   const allMarks = Object.entries(allUsersData)
  //     .map(([userId, data]) => ({ uid: userId, marks: Number(data.marks) }))
  //     .filter(user => !isNaN(user.marks));

  //   if (allMarks.length === 0) {
  //     return res.status(404).json({ message: 'No marks available to rank' });
  //   }

  //   // Sort all marks in descending order
  //   allMarks.sort((a, b) => b.marks - a.marks);

  //   // Calculate rank with handling for ties
  //   let rank = 1;
  //   let previousMarks = null;
  //   let skipRank = 0;

  //   for (let i = 0; i < allMarks.length; i++) {
  //     const currentUser = allMarks[i];

  //     if (previousMarks !== null) {
  //       if (currentUser.marks < previousMarks) {
  //         rank += 1 + skipRank;
  //         skipRank = 0;
  //       } else {
  //         skipRank += 1;
  //       }
  //     }

  //     if (currentUser.uid === uid) {
  //       break;
  //     }

  //     previousMarks = currentUser.marks;
  //   }

  //   res.status(200).json({ rank });

  // } catch (error) {
  //   console.error('Error getting global rank:', error);
  //   res.status(500).json({ message: 'Failed to get global rank', error: error.message });
  // }
});







export default givenRouts;
