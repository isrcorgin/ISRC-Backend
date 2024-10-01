import {dbRef, push, set, database} from "../config/firebase-config.js"

// Function to clean up the topic by removing age ranges or trailing numbers
function cleanTopic(topic) {
  // Split the topic string by the last occurrence of digits and age group pattern
  const parts = topic.split(/(?: \d{1,2} to \d{1,2})$/);
  return parts[0].trim(); // Return the main topic part
}

// Function to generate certificates for each team member
async function generateTeamCertificates(userData) {
  try {
    const { team } = userData;
    if (!team) {
      return { success: false, message: "Team data not found" };
    }

    const { teamName, members, competitionTopic } = team;
    const topic = cleanTopic(competitionTopic.topic); // Clean the topic

    if (!teamName || !members || members.length === 0) {
      return { success: false, message: "Team name or members data missing" };
    }

    // Loop through each member in the team
    for (const member of members) {
      const { name, authCode } = member;

      if (!name || !authCode) {
        console.log(`Skipping member due to missing name or authCode: ${JSON.stringify(member)}`);
        continue; // Skip this member if required fields are missing
      }

      // Create a new certificate reference in the "certificates" node
      const newCertificateRef = push(dbRef(database, "certificates"));

      // Set the certificate data with only the required fields
      await set(newCertificateRef, {
        teamName, // Include the team name from the team node
        topic, // Cleaned topic
        name, // Member's name
        authCode, // Member's unique auth code
        type: "tm"
      });

      console.log(`Certificate generated for ${name}`);
    }

    return { success: true, message: "Team certificates generated successfully" };
  } catch (error) {
    console.error("Error generating team certificates:", error);
    return { success: false, message: "Error generating team certificates", error };
  }
}

export default generateTeamCertificates;