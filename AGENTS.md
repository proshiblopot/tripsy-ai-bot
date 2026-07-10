# TriPsy Project Golden Rules

You must strictly adhere to the following laws at all times when working on this project:

1. **DO NOT modify API key handling or API calls**: Never change how the API is called or how the API key (`VITE_GOOGLE_API_KEY`) is fetched. Ignore missing key errors in the AI Studio sandbox, as the application relies on Vercel environment variables where it works correctly.
2. **DO NOT change temperature**: Never modify the `temperature` settings for the Gemini models in the code.
3. **DO NOT disable thinking**: Never disable or remove the "thinking" (reasoning) capability of the models.
4. **Require confirmation for code changes**: Always explain your proposed changes and wait for the user's explicit confirmation before modifying any code.
