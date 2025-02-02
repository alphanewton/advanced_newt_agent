import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import wxflows from "@wxflows/sdk/langchain";
import { ToolNode } from "@langchain/langgraph/prebuilt";

// Connect to wxflows
const toolClient = new wxflows({
    endpoint: process.env.WXFLOWS_ENDPOINT || "",
    apikey: process.env.WXFLOWS_APIKEY,
  });
  
  // Retrieve the tools
  const tools = await toolClient.lcTools;
  const toolNode = new ToolNode(tools);
  
  // Connect to the LLM provider with better tool instructions
function initializeModel() {
    try {
        const model = new ChatGoogleGenerativeAI({
            modelName: "gemini-1.5-flash",
            apiKey: process.env.GOOGLE_GENAI_API_KEY,  // Ensure this is correctly set in the environment
            temperature: 0.1,
            maxOutputTokens: 4096,
            streaming: true,
            callbacks: [
                {
                    handleLLMStart: async () => {
                      // console.log("🤖 Starting LLM call");
                    },
                    handleLLMEnd: async (output) => {
                      console.log("🤖 End LLM call", output);
                      const usage = output.llmOutput?.usage;
                      if (usage) {
                        // console.log("📊 Token Usage:", {
                        //   input_tokens: usage.input_tokens,
                        //   output_tokens: usage.output_tokens,
                        //   total_tokens: usage.input_tokens + usage.output_tokens,
                        //   cache_creation_input_tokens:
                        //     usage.cache_creation_input_tokens || 0,
                        //   cache_read_input_tokens: usage.cache_read_input_tokens || 0,
                        // });
                      }
                    },
                    // handleLLMNewToken: async (token: string) => {
                    //   // console.log("🔤 New token:", token);
                    // },
                },
            ]
        }).bind;
        
        return model;
    } catch (error) {
        console.error("Error initializing the model:", error);
        return null;
    }
}
