import express from "express";
import { database, dbRef, get, push, set } from "../config/firebase-config.js";

const router = express.Router();

// POST route for form submissions
router.post("/submit-form", async (req, res) => {
  try {
    const awardsRef = dbRef(database, "awards-nominations");

    // Create a new entry in the awards-nominations node
    const newEntryRef = push(awardsRef);

    const formDataWithTimestamp = {
      ...req.body, // All form data, including dynamic award data
      timestamp: Date.now(), // Add a timestamp
    };

    // Save the form data to Firebase
    await set(newEntryRef, formDataWithTimestamp);

    // Respond with success
    res.status(200).json({
      message: "Form data submitted successfully!",
      entryId: newEntryRef.key,
    });
  } catch (error) {
    console.error("Error submitting form data:", error);

    // Respond with error
    res.status(500).json({ message: "Error submitting form data." });
  }
});

// GET route to fetch all awards nominations

router.get("/get-nominations", async (req, res) => {
  try {
    // Reference to the awards-nominations node in the database
    const awardsRef = dbRef(database, "awards-nominations");

    // Fetch the data from the database
    const snapshot = await get(awardsRef);

    if (snapshot.exists()) {
      // Transform the data into an array format
      const nominations = Object.keys(snapshot.val()).map((key) => ({
        id: key, // Add the unique key (ID)
        ...snapshot.val()[key], // Include all the other data
      }));

      // Respond with the nominations
      res.status(200).json(nominations);
    } else {
      // If no data exists
      res.status(404).json({ message: "No nominations found." });
    }
  } catch (error) {
    console.error("Error fetching nominations:", error);

    // Respond with error
    res.status(500).json({ message: "Error fetching nominations." });
  }
});

export default router;
