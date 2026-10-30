# Faculty Course & Workload Management System

## Important: MongoDB on Vercel
Vercel cannot connect to MongoDB running only on your laptop (`localhost`). For deployment, create a MongoDB Atlas cloud database and add its connection string as the `MONGODB_URI` environment variable in Vercel.

## 1. Create the MongoDB Atlas database
1. Sign in at https://www.mongodb.com/atlas/database and create a free cluster.
2. Under **Database Access**, create a database user and remember its username and password.
3. Under **Network Access**, add `0.0.0.0/0` so Vercel can reach the cluster. Use a strong database password; restrict access further if you have a fixed egress-IP solution.
4. Click **Connect** → **Drivers** → choose Node.js and copy the connection string. It looks like:
   `mongodb+srv://USERNAME:PASSWORD@cluster-name.xxxxx.mongodb.net/faculty_workload_db?retryWrites=true&w=majority`
5. Replace `USERNAME` and `PASSWORD`. If the password contains special characters, URL-encode them. Keep this URI private.

## 2. Deploy to Vercel
1. Push this project to GitHub. Do not upload `node_modules` or `.env`.
2. In Vercel, choose **Add New → Project**, import the GitHub repository.
3. Set the **Root Directory** to the folder containing `server.js` and `vercel.json` (normally the repository root).
4. In **Project Settings → Environment Variables**, add:
   - Name: `MONGODB_URI`
   - Value: your complete MongoDB Atlas connection string
   - Environments: Production, Preview, Development (at least Production)
5. Save, then go to **Deployments** and redeploy the latest deployment so the variable is applied.
6. Open `https://YOUR-PROJECT.vercel.app/api/health` — it should return an API-running message.
7. Open `https://YOUR-PROJECT.vercel.app/api/db-health` — it should return `connected: true` when Atlas settings are correct.
8. Open the main Vercel URL to use the application.

## 3. Run locally on Windows
1. Install Node.js 20.19+ (or a current supported Node.js LTS).
2. Install and start MongoDB locally, or use an Atlas URI in `.env`.
3. Open this folder in VS Code.
4. Open Terminal and run:
   `npm install`
5. Run:
   `npm start`
6. Open `http://localhost:3000`.

For auto-restart during development, run `npm run dev`.

## 4. If Vercel still says MongoDB disconnected
- Confirm the Vercel variable is named exactly `MONGODB_URI` (not `MONGO_URI`).
- Confirm it contains the Atlas `mongodb+srv://` URI, not `localhost`.
- Confirm the Atlas database user/password are correct and URL-encoded if needed.
- Confirm Atlas Network Access includes `0.0.0.0/0`.
- Redeploy after changing environment variables.
- Check Vercel **Deployments → Functions → Logs** for the connection error.

The project uses Express serverless routing on Vercel and reuses the Mongoose connection during warm function invocations. Local `.env` is ignored by Git and is not used as a substitute for Vercel Environment Variables.
