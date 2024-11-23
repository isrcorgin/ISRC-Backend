import express from "express";
import { database, dbRef, push, set } from "../config/firebase-config.js";

const router = express.Router();

// POST route for form submissions
router.post("/submit-form", async (req, res) => {
  try {
    // Reference to the Awards-nominations node
    const awardsRef = dbRef(database, "awards-nominations");

    // Push new entry into the Awards-nominations node
    const newEntryRef = push(awardsRef);
    const formDataWithTimestamp = {
      ...req.body,
      timestamp: Date.now(), // Add a timestamp field
    };
    await set(newEntryRef, formDataWithTimestamp);

    res.status(200).json({
      message: "Form data submitted successfully!",
      entryId: newEntryRef.key,
    });
  } catch (error) {
    console.error("Error submitting form data:", error);
    res.status(500).json({ message: "Error submitting form data." });
  }
});

export default router;
