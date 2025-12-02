import React, { useState, useEffect } from 'react';

// ➡️ NEW FIREBASE IMPORTS
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, query, onSnapshot } from 'firebase/firestore';


// ⚠️ IMPORTANT: If token error comes then need to generate with new token
// Go to settings > access token > create new token and paste that token below.
const HF_ACCESS_TOKEN = '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';

// Use a publicly supported model for Text-to-Image inference.
const MODEL_ID = 'stabilityai/stable-diffusion-xl-base-1.0';
const API_URL = `https://router.huggingface.co/hf-inference/models/${MODEL_ID}`;

// --- GLOBAL STYLES FOR SCROLLBAR REMOVAL, GRADIENT BACKGROUND, AND FEEDBACK OVERLAY ---
const globalStyles = `
body, #root {
    margin: 0;
    padding: 0;
    height: 100vh;
    overflow: hidden;
    font-family: 'Inter', sans-serif;
    background: linear-gradient(135deg, #7B68EE 0%, #9370DB 50%, #BA55D3 100%);
    display: flex;
    justify-content: center;
    align-items: center;
}

/* Image Feedback Quadrant Styles */
.image-quadrant-container {
    position: relative;
    display: inline-block; 
}

.image-quadrant {
    position: absolute;
    border: 2px solid transparent; 
    transition: background-color 0.2s ease-in-out, border-color 0.2s ease-in-out;
    cursor: pointer;
    box-sizing: border-box; 
    z-index: 10; 
}

.image-quadrant:hover {
    background-color: rgba(255, 255, 0, 0.2); /* Light yellow highlight on hover */
    border-color: yellow;
}

/* Positions for each quadrant */
.quadrant-tl { top: 0; left: 0; width: 50%; height: 50%; } 
.quadrant-tr { top: 0; left: 50%; width: 50%; height: 50%; } 
.quadrant-bl { top: 50%; left: 0; width: 50%; height: 50%; } 
.quadrant-br { top: 50%; left: 50%; width: 50%; height: 50%; } 

/* Feedback Modal styles */
.feedback-modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.6);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 100;
}

.feedback-modal {
    background-color: white;
    padding: 25px;
    border-radius: 10px;
    box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
    max-width: 400px;
    width: 90%;
}

.feedback-modal textarea {
    width: 100%;
    min-height: 80px;
    padding: 10px;
    margin-bottom: 15px;
    border: 1px solid #ddd;
    border-radius: 5px;
    resize: vertical;
    font-size: 14px;
}

.feedback-modal .submit-btn {
    background-color: #6A5ACD; /* primaryColor */
    color: white;
    margin-right: 10px;
}
.feedback-modal .cancel-btn {
    background-color: #e0e0e0;
    color: #333;
}
.feedback-modal button {
    padding: 10px 15px;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    font-weight: bold;
    font-size: 15px;
    transition: background-color 0.2s;
}

/* Data Viewer Styles */
.data-viewer-container {
    margin-top: 20px;
    border-top: 1px solid #ddd;
    padding-top: 20px;
}
.feedback-item {
    border: 1px solid #eee;
    padding: 10px;
    margin-bottom: 10px;
    border-radius: 6px;
    background-color: #fff;
    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}
`;
// --- END GLOBAL STYLES ---


// ➡️ NEW: Trustworthiness Approximation Function (Proxy Metric)
const calculateTrustworthiness = (duration) => {
    // Defines a trust score based on generation time: faster is generally more reliable/stable.
    let trustScore = 100; // Max score
    
    // Convert duration (string) to number for comparison
    const time = parseFloat(duration);

    if (time > 30) {
        trustScore = 50; // Very slow (potential server/queue issue)
    } else if (time > 15) {
        trustScore = 75; // Average speed
    } 
    // If time <= 15s, trust remains high (100)
    
    return trustScore;
};


function TextToImageApp() {
    const [prompt, setPrompt] = useState('');
    const [imageURL, setImageURL] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    // Feedback states
    const [showFeedbackModal, setShowFeedbackModal] = useState(false);
    const [currentQuadrant, setCurrentQuadrant] = useState(null);
    const [feedbackText, setFeedbackText] = useState('');

    // Metrics and History States
    const [timeTaken, setTimeTaken] = useState(null); 
    const [resultMetrics, setResultMetrics] = useState(null); 
    const [history, setHistory] = useState([]); 
    const [showInfoModal, setShowInfoModal] = useState(false); 

    // ➡️ NEW: Firebase States
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    
    // ➡️ NEW: Feedback Data State from Firestore
    const [savedFeedback, setSavedFeedback] = useState([]);
    const [showDataViewer, setShowDataViewer] = useState(false); 

    const primaryColor = '#6A5ACD'; 
    const accentColor = '#9370DB'; 

    // Inject global styles
    useEffect(() => {
        if (!document.getElementById('global-styles')) {
            const style = document.createElement('style');
            style.id = 'global-styles';
            style.textContent = globalStyles;
            document.head.appendChild(style);
        }
    }, []);

    // 1. FIREBASE INITIALIZATION AND AUTHENTICATION
    useEffect(() => {
        // Use provided global variables
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : null;
        const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

        if (!firebaseConfig) {
            console.error("Firebase config is missing. Cannot initialize Firestore.");
            return;
        }

        try {
            const app = initializeApp(firebaseConfig, appId);
            const authInstance = getAuth(app);
            const dbInstance = getFirestore(app);

            setDb(dbInstance);
            setAuth(authInstance);

            // Authentication listener
            const unsubscribe = onAuthStateChanged(authInstance, (user) => {
                if (user) {
                    setUserId(user.uid);
                    console.log("Firebase Auth Ready. User ID:", user.uid);
                }
                setIsAuthReady(true);
            });

            // Initial sign-in attempt
            const authenticate = async () => {
                try {
                    if (initialAuthToken) {
                        await signInWithCustomToken(authInstance, initialAuthToken);
                        console.log("Signed in with custom token.");
                    } else {
                        // Fallback to anonymous sign-in
                        await signInAnonymously(authInstance);
                        console.log("Signed in anonymously.");
                    }
                } catch (error) {
                    console.error("Firebase sign-in failed:", error);
                }
            };
            authenticate();

            return () => unsubscribe(); // Cleanup auth listener
        } catch (e) {
            console.error("Firebase initialization failed:", e);
        }
    }, []); 

    // 2. REAL-TIME DATA LISTENER (Feedback Data)
    useEffect(() => {
        // Guard clause: Do not attempt to query Firestore until authenticated and db/userId are available.
        if (!isAuthReady || !db || !userId) return;

        console.log("Setting up Firestore listener for feedback data.");
        
        // Collection path for public/shared data
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        const feedbackCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'feedback_data');
        
        const feedbackQuery = query(feedbackCollectionRef); 
        
        const unsubscribe = onSnapshot(feedbackQuery, (snapshot) => {
            const feedbackList = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                timestamp: doc.data().timestamp ? new Date(doc.data().timestamp) : new Date(0)
            }));
            
            // Sort in memory by timestamp descending (most recent first)
            feedbackList.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

            setSavedFeedback(feedbackList);
            console.log("Fetched new feedback data:", feedbackList.length);
        }, (error) => {
            console.error("Firestore real-time listener failed:", error);
        });

        return () => unsubscribe(); // Cleanup snapshot listener
    }, [isAuthReady, db, userId]); // Re-run when auth status or db/userId change


    const generateImage = async (e) => {
        e.preventDefault();

        if (!prompt.trim()) {
            setError('Please enter a prompt.');
            return;
        }

        if (!HF_ACCESS_TOKEN || HF_ACCESS_TOKEN === 'YOUR_HUGGING_FACE_TOKEN') {
            setError("Error: Please replace 'YOUR_HUGGING_FACE_TOKEN' with your actual Hugging Face Access Token.");
            return;
        }

        // ➡️ START TIMER ⏱️
        const startTime = Date.now();

        setIsLoading(true);
        setError(null);
        setImageURL(null);
        setResultMetrics(null); 
        setTimeTaken(null); 

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${HF_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    inputs: prompt,
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API Error: ${response.statusText}. Details: ${errorText.substring(0, 100)}...`);
            }

            // ➡️ END TIMER ⏱️
            const endTime = Date.now();
            const duration = ((endTime - startTime) / 1000).toFixed(2); // Duration in seconds

            const imageBlob = await response.blob();
            const url = URL.createObjectURL(imageBlob);
            setImageURL(url);

            // ➡️ Calculate and save metrics
            const metrics = {
                duration: duration,
                trustworthiness: calculateTrustworthiness(duration),
                prompt: prompt,
                id: Date.now(), // Unique ID for key
            };
            
            setResultMetrics(metrics);
            setTimeTaken(duration);

            // ➡️ Update History (For Plotting)
            setHistory(prevHistory => [...prevHistory, metrics]);

        } catch (err) {
            console.error('Image generation failed:', err);
            setError(`Image generation failed: ${err.message || 'An unknown error occurred.'}`);
        } finally {
            setIsLoading(false);
        }
    };

    // Feedback Handlers
    const handleQuadrantClick = (quadrantName) => {
        if (imageURL) {
            setCurrentQuadrant(quadrantName);
            setFeedbackText(''); // Clear previous text
            setShowFeedbackModal(true);
        }
    };

    // 3. UPDATED: Save feedback to Firestore
    const submitFeedback = async () => { 
        if (!feedbackText.trim()) {
            setError('Please enter your feedback before submitting.');
            return;
        }
        
        if (!db || !userId) {
            setError('System not ready: Firebase database connection or user authentication failed. Please wait a moment.');
            console.error('Firestore not initialized or userId unavailable.');
            return;
        }

        try {
            // Data to save
            const feedbackData = {
                quadrant: currentQuadrant,
                comment: feedbackText.trim(),
                imagePrompt: prompt,
                timestamp: new Date().toISOString(), // Use ISO string for consistent storage
                userId: userId.substring(0, 8) + '...', // Show truncated ID for privacy in UI, but store full ID
            };

            // Public Collection path: /artifacts/{appId}/public/data/feedback_data
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
            const feedbackCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'feedback_data');

            // Save document
            await addDoc(feedbackCollectionRef, feedbackData);
            
            console.log('✅ User Feedback Captured and Saved to Firestore:', feedbackData);

            // Show confirmation message
            setError(null);
            setShowInfoModal(`Thank you for your feedback on the ${currentQuadrant} quadrant! It has been successfully saved to the shared database.`);

            // Reset and close modal
            setFeedbackText('');
            setCurrentQuadrant(null);
            setShowFeedbackModal(false);

        } catch (error) {
            console.error('Error saving feedback to Firestore:', error);
            setError(`Failed to save feedback: ${error.message}. Check console for details.`);
        }
    };

    const cancelFeedback = () => {
        setFeedbackText('');
        setCurrentQuadrant(null);
        setShowFeedbackModal(false);
    };

    const closeInfoModal = () => {
        setShowInfoModal(false);
        setError(null); // Clear any related error
    };


    return (
        <div style={{
            padding: '30px',
            maxWidth: '550px',
            width: '100%',
            backgroundColor: '#ffffff', 
            borderRadius: '12px',
            boxShadow: '0 8px 16px rgba(0, 0, 0, 0.2)', 
            boxSizing: 'border-box',
            overflowY: 'auto', // Allow scrolling if content overflows
            maxHeight: '95vh', 
        }}>
            <h1 style={{
                textAlign: 'center',
                color: primaryColor,
                borderBottom: `2px solid ${accentColor}`,
                paddingBottom: '10px',
                marginBottom: '30px',
                fontSize: '24px'
            }}>
                ⚡ Image Generator & Analytics ⚡
            </h1>
            
            {/* Display Current User ID */}
            {userId && (
                <div style={{ textAlign: 'center', marginBottom: '15px', fontSize: '12px', color: '#666' }}>
                    **User ID:** <span style={{ fontWeight: '600', color: primaryColor }}>{userId}</span>
                </div>
            )}


            <form onSubmit={generateImage} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <input
                    type="text"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Enter your image prompt (e.g., A robot chef cooking noodles, cinematic lighting)"
                    disabled={isLoading}
                    style={{
                        padding: '12px',
                        fontSize: '16px',
                        border: '1px solid #ddd',
                        borderRadius: '6px',
                        boxSizing: 'border-box',
                        transition: 'border-color 0.3s'
                    }}
                />
                <button
                    type="submit"
                    disabled={isLoading}
                    style={{
                        padding: '12px 25px',
                        fontSize: '18px',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        backgroundColor: isLoading ? '#ccc' : primaryColor,
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        transition: 'background-color 0.3s',
                        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
                    }}
                >
                    {isLoading ? 'Generating Image...' : 'Generate Image'}
                </button>
            </form>

            {/* Error and Info Modals (unified) */}
            {(error || showInfoModal) && (
                <div style={{ 
                    color: error ? '#D9534F' : primaryColor, 
                    backgroundColor: error ? '#F2DEDE' : '#E0F7FA', 
                    marginBottom: '15px', 
                    padding: '12px', 
                    border: `1px solid ${error ? '#D9534F' : accentColor}`, 
                    borderRadius: '6px', 
                    marginTop: '15px',
                    position: 'relative'
                }}>
                    {error || showInfoModal}
                    <button 
                        onClick={closeInfoModal}
                        style={{
                            position: 'absolute',
                            top: '5px',
                            right: '5px',
                            background: 'none',
                            border: 'none',
                            fontSize: '16px',
                            cursor: 'pointer',
                            color: error ? '#D9534F' : primaryColor,
                        }}
                    >
                        &times;
                    </button>
                </div>
            )}

            {isLoading && (
                <div style={{ textAlign: 'center', fontSize: '16px', color: '#555', marginTop: '20px' }}>
                    <p>⏳ Loading... This may take up to a minute on the first request.</p>
                </div>
            )}

            {imageURL && (
                <div style={{ marginTop: '30px', textAlign: 'center' }}>
                    <h2 style={{ fontSize: '20px', color: primaryColor, marginBottom: '15px' }}>Generated Image</h2>
                    <p style={{marginBottom: '10px', fontSize: '14px', color: '#666'}}>
                        ✨ **Click any part of the image to give specific quality feedback!**
                    </p>
                    
                    {/* Image with Quadrant Overlay Container */}
                    <div className="image-quadrant-container">
                        <img
                            src={imageURL}
                            alt={prompt || 'Generated Image'}
                            style={{
                                maxWidth: '100%',
                                height: 'auto',
                                border: `4px solid ${accentColor}`,
                                borderRadius: '8px',
                                boxShadow: '0 4px 8px rgba(0, 0, 0, 0.1)',
                            }}
                        />
                        {/* Quadrant Overlays */}
                        <div className="image-quadrant quadrant-tl" onClick={() => handleQuadrantClick('Top-Left')}></div>
                        <div className="image-quadrant quadrant-tr" onClick={() => handleQuadrantClick('Top-Right')}></div>
                        <div className="image-quadrant quadrant-bl" onClick={() => handleQuadrantClick('Bottom-Left')}></div>
                        <div className="image-quadrant quadrant-br" onClick={() => handleQuadrantClick('Bottom-Right')}></div>
                    </div>
                    
                    {/* Metrics and Trend Display */}
                    {(resultMetrics || history.length > 0) && (
                        <div style={{ marginTop: '30px', padding: '15px', border: `1px solid ${accentColor}`, borderRadius: '8px', backgroundColor: '#f9f9f9', textAlign: 'left' }}>
                            <h3 style={{ color: primaryColor, borderBottom: '1px solid #ddd', paddingBottom: '10px', marginBottom: '15px' }}>
                                Metrics & Performance Analysis
                            </h3>
                            
                            {/* Current Result Metrics */}
                            {resultMetrics && (
                                <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-around', fontSize: '16px', flexWrap: 'wrap' }}>
                                    <p style={{ margin: '5px 0' }}>
                                        **⏱️ Time Taken:** <span style={{ fontWeight: 'bold', color: primaryColor }}>{resultMetrics.duration}s</span>
                                    </p>
                                    <p style={{ margin: '5px 0' }}>
                                        **🛡️ Trust Score:** <span style={{ fontWeight: 'bold', color: resultMetrics.trustworthiness > 80 ? '#28a745' : (resultMetrics.trustworthiness > 50 ? '#ffc107' : '#dc3545') }}>{resultMetrics.trustworthiness}%</span>
                                    </p>
                                </div>
                            )}
                            
                            {/* Trend Plot (Simple CSS Bars) */}
                            <h4 style={{ color: primaryColor, fontSize: '16px', marginTop: '0' }}>Generation Time Trend (Last {Math.min(history.length, 10)} Runs)</h4>
                            <div style={{ display: 'flex', alignItems: 'flex-end', height: '100px', borderBottom: '1px solid #ccc', paddingBottom: '5px' }}>
                                {/* Only show the last 10 entries for a clean plot */}
                                {history.slice(-10).map((item) => {
                                    const maxTime = 30; // Max time for scaling the chart height
                                    const durationNum = parseFloat(item.duration);
                                    const heightPercentage = (durationNum / maxTime) * 100;
                                    const barColor = durationNum < 10 ? '#28a745' : (durationNum < 20 ? '#ffc107' : '#dc3545'); // Green, Yellow, Red
                                    
                                    return (
                                        <div 
                                            key={item.id} 
                                            title={`Time: ${item.duration}s | Prompt: ${item.prompt.substring(0, 20)}...`}
                                            style={{
                                                width: `${100 / Math.min(history.length, 10)}%`, // Distribute bars evenly
                                                height: `${Math.min(heightPercentage, 100)}%`, 
                                                backgroundColor: barColor,
                                                marginRight: '2px',
                                                transition: 'height 0.5s ease',
                                                borderRadius: '3px 3px 0 0',
                                                cursor: 'help'
                                            }}
                                        ></div>
                                    );
                                })}
                            </div>
                            <p style={{ fontSize: '12px', color: '#888', textAlign: 'right', marginTop: '5px' }}>Height represents time taken (Lower is better)</p>
                        </div>
                    )}
                </div>
            )}
            
            {/* 4. DATA VIEWER TOGGLE AND DISPLAY */}
            <div className="data-viewer-container">
                <button
                    onClick={() => setShowDataViewer(!showDataViewer)}
                    style={{
                        padding: '10px 15px',
                        fontSize: '14px',
                        cursor: 'pointer',
                        backgroundColor: showDataViewer ? '#dc3545' : accentColor,
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        fontWeight: '600',
                        width: '100%',
                        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
                    }}
                >
                    {showDataViewer ? 'Hide Captured Feedback' : `View All Captured Feedback (${savedFeedback.length})`}
                </button>

                {showDataViewer && (
                    <div style={{ maxHeight: '300px', overflowY: 'auto', marginTop: '15px', paddingRight: '10px' }}>
                        {savedFeedback.length === 0 ? (
                            <p style={{ textAlign: 'center', color: '#888' }}>No feedback submitted yet. Be the first!</p>
                        ) : (
                            savedFeedback.map((item) => (
                                <div key={item.id} className="feedback-item">
                                    <p style={{ margin: '0 0 5px 0', fontSize: '14px', fontWeight: 'bold', color: primaryColor }}>
                                        Quadrant: {item.quadrant}
                                    </p>
                                    <p style={{ margin: '0 0 5px 0', fontSize: '12px', color: '#333' }}>
                                        **Prompt:** "{item.imagePrompt.substring(0, 50)}{item.imagePrompt.length > 50 ? '...' : ''}"
                                    </p>
                                    <p style={{ margin: '0 0 5px 0', fontSize: '14px', color: '#555' }}>
                                        **Comment:** {item.comment}
                                    </p>
                                    <p style={{ margin: '5px 0 0 0', fontSize: '10px', color: '#aaa' }}>
                                        Submitted by User: {item.userId} on {new Date(item.timestamp).toLocaleTimeString()}
                                    </p>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>
            
            {/* Feedback Modal */}
            {showFeedbackModal && (
                <div className="feedback-modal-overlay">
                    <div className="feedback-modal">
                        <h3 style={{marginTop: '0'}}>Feedback for **{currentQuadrant}** Quadrant</h3>
                        <textarea
                            placeholder="E.g., 'The sunflower looks too blurry here' or 'The colors are perfect!'"
                            value={feedbackText}
                            onChange={(e) => setFeedbackText(e.target.value)}
                        ></textarea>
                        <div>
                            <button className="submit-btn" onClick={submitFeedback}>Submit Feedback</button>
                            <button className="cancel-btn" onClick={cancelFeedback}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default TextToImageApp;
