⚡ AI Image Generator & Targeted Feedback Loop (HiTL Pipeline)

Project Overview

This repository hosts a high-performance, lightweight Text-to-Image Generation application built with React and powered by the Stable Diffusion XL (SDXL) model via the Hugging Face Inference API.

The core innovation of this project is its integrated Human-in-the-Loop (HiTL) design. Unlike standard generators, our system is engineered to function as the critical first step in an ML data refinement pipeline, utilizing a unique Four-Quadrant Feedback mechanism and Firestore data persistence to accelerate the collection of high-fidelity human preference data. This directly addresses the problems of resource limitation and the need for continuous model improvement.

✨ Key Features

This application goes beyond basic image generation by focusing on data strategy and performance monitoring.

1. Advanced Feedback Collection (HiTL Data Strategy)

Four-Quadrant Feedback Modal: Users can click on any of the four quadrants of the generated image (Top-Left, Top-Right, Bottom-Left, Bottom-Right) to provide localized, specific feedback. This collects spatial and contextual critique, invaluable for targeting specific model failures during fine-tuning.

Persistent Data Store (Firestore): All structured feedback (Prompt, Quadrant, Comment, Timestamp, User ID) is immediately saved to a shared, real-time Google Firestore database. This ensures data is captured, persisted, and ready for collaborative analysis or use in DPO/RLHF algorithms.

Real-Time Data Viewer: A toggleable section allows all users to view the live stream of collected feedback, demonstrating the system's collaborative and functional data pipeline.

2. Performance Engineering & Observability

Real-Time Latency Monitoring: The application tracks and displays the exact time taken for the Hugging Face API inference call, establishing a critical Key Performance Indicator (KPI) for model evaluation.

Trustworthiness Score: A proprietary heuristic calculates an approximate Trust Score based on generation latency (faster = higher stability/trust), providing instant user feedback on system health.

Time-Series Trend Plot: A simple bar chart visualizes the generation time trend across the last 10 requests, allowing users to observe system performance stability over time.

3. Architectural Design

Client/Serverless Abstraction: The lightweight React frontend acts purely as a client, abstracting the heavy computational burden of image generation to the Hugging Face platform, making the application highly performant and accessible on resource-limited devices.

Model Agnosticism: The use of the MODEL_ID constant makes the architecture highly modular, ready for immediate A/B testing of various models (e.g., custom LoRAs) without requiring code restructuring.

🚀 Getting Started

To run this project locally, you will need a modern Node.js environment and access to the necessary APIs.

Prerequisites

Node.js & npm: Installed on your system.

Hugging Face Access Token: Required for the inference API.

Firebase/Firestore Configuration: Required for data persistence (usually provided by the hosting environment, but needed for local development setup).

Installation

Clone the Repository:

git clone [https://github.com/bshivamkumar/AI-Image-Generator](https://github.com/bshivamkumar/AI-Image-Generator)
cd AI-Image-Generator


Install Dependencies:

npm install


Configure API Key:
Open TextToImageApp.js and replace the placeholder value for HF_ACCESS_TOKEN.

const HF_ACCESS_TOKEN = 'YOUR_HUGGING_FACE_TOKEN_HERE';


Run the Application:

npm start


The application will typically open in your browser at http://localhost:3000.

⚙️ Technology Stack

Frontend: React (Functional Components & Hooks)

Styling: Inline Styling & Custom CSS

Backend/Inference: Hugging Face Inference API (stabilityai/stable-diffusion-xl-base-1.0)

Data Persistence: Google Firestore (for HiTL Feedback Storage)

Authentication: Firebase Authentication (Anonymous/Custom Token Sign-in)

🤝 Contribution

Contributions are welcome! If you have suggestions for performance improvements, feature enhancements, or bug fixes, please open an issue or submit a pull request.
