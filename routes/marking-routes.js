import express from 'express';
import { dbRef, set, get, database, update } from '../config/firebase-config.js'; 
import verifyToken from '../middleware/authToken.js';

const markingRouter = express.Router();

async function enterMarks(uid, formData) {
    try {
        if (!formData) {
            return res.status(400).send({ message: 'No form data provided' });
        }

        const userMarksRef = dbRef(database, `users/${uid}/marks/`);
        await set(userMarksRef, formData);

        console.log("Marks Processed Successfully")
    } catch (error) {
        console.error('Error processing marks:', error);
    }
}

async function calculateTotal(uid) {
    try {
        const userRef = dbRef(database, `users/${uid}/marks/`);
        const userSnapshot = await get(userRef);
        const marksData = userSnapshot.val();

        if (!marksData) {
            throw new Error('Marks data not found');
        }

        const calculateSectionTotal = (section) => {
            return Object.values(section).reduce((total, value) => {
                const numericValue = Number(value) || 0;
                return total + numericValue;
            }, 0);
        };

        const totalMarks = {
            innovation: calculateSectionTotal(marksData.innovation),
            technical: calculateSectionTotal(marksData.technical),
            applicability: calculateSectionTotal(marksData.applicability),
            presentation: calculateSectionTotal(marksData.presentation),
            challenge: calculateSectionTotal(marksData.challenge),
            designFunctionality: calculateSectionTotal(marksData.designFunctionality),
        };

        const overallTotal = Object.values(totalMarks).reduce((total, value) => total + value, 0);

        marksData["Total marks"] = {
            sectionTotals: totalMarks,
            overallTotal: overallTotal
        };

        await update(userRef, marksData);
        console.log('Total marks calculated and stored successfully!');
    } catch (error) {
        console.error('Error calculating total marks:', error);
    }
}



markingRouter.post('/marks', verifyToken, async (req, res) => {
    const { uid } = req.body;
    const { formData } = req.body;

    try {
        await enterMarks(uid, formData);
        await calculateTotal(uid);
        res.status(200).json({ message: 'Marks processed and total calculated successfully!' });
    } catch (error) {
        res.status(500).json({ message: 'Failed to process marks and calculate total', error: error.message });
    }
});

markingRouter.get('/result', verifyToken, async (req, res) => {
    const { uid } = req.user;
    const userMarksRef = dbRef(database, `users/${uid}/marks/`);
    
    try {
        const marksSnapshot = await get(userMarksRef);
        const marksData = marksSnapshot.val();

        if (!marksData) {
            return res.status(404).json({ error: "Marks not found" });
        }

        res.status(200).json({ message: "Marks retrieved successfully", marks: marksData });

    } catch (error) {
        console.error('Error fetching marks:', error);
        return res.status(500).json({ message: 'Failed to fetch marks', error: error.message });
    }
});

export default markingRouter;
