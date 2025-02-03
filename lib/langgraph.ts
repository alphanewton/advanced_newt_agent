import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import wxflows from "@wxflows/sdk/langchain";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { END, MemorySaver, MessagesAnnotation, START, StateGraph } from "@langchain/langgraph";
import SYSTEM_MESSAGE from "@/constanst/systemMessages";
import {ChatPromptTemplate, MessagesPlaceholder} from "@langchain/core/prompts"
import { AIMessage, BaseMessage, SystemMessage, trimMessages } from "@langchain/core/messages";


// Connect to wxflows
const toolClient = new wxflows({
    endpoint: process.env.WXFLOWS_ENDPOINT || "",
    apikey: process.env.WXFLOWS_APIKEY,
  });
  
// Retrieve the tools
const tools = await toolClient.lcTools;
const toolNode = new ToolNode(tools);

//Trim the messages to manage conversation history -> last 10 messages
const trimmer = trimMessages({
  maxTokens: 10,
  strategy: "last",
  tokenCounter: (msgs) => msgs.length,
  includeSystem: true,
  allowPartial: false,
  startOn: "human",
});

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
        }).bindTools(tools);
        
        return model;
    } catch (error) {
        console.error("Error initializing the model:", error);
        return null;
    }
}

//Determines whether should contine
function shouldContinue(state: typeof MessagesAnnotation.State){
  const messages = state.messages;
  const lastMessage = messages[messages.length - 1] as AIMessage;

  //If the LLM makes a tool message, route back to agent -> any more tool calls
  if(lastMessage.tool_calls?.length){
    return "tools";
  }

  //If the last message is a tool message, route back to agent -> extract content of tool calls
  if(lastMessage.content && lastMessage._getType() === "tool"){
    return "agent";
  }

  return END;
}

const createWorkflow = () => {
  const model = initializeModel();
  const stateGraph = new StateGraph(MessagesAnnotation).
  addNode(
    "agent", 
    async (state) => {
      //Create system message
      const systemContent = SYSTEM_MESSAGE;

      //Create prompt template with system message and messages placeholder
      const promptTemplate = ChatPromptTemplate.fromMessages([
        new SystemMessage(systemContent),
        new MessagesPlaceholder("messages")
      ])

      //Trim the messages to manage conversation history
      const trimmedMessages = await trimmer.invoke(state.messages)

      //Format the prompt with the current messages
      const prompt = await promptTemplate.invoke({messages: trimmedMessages})

      //Get response from model
      const response = await model?.invoke(prompt)

      return  {messages: [response]}
    }
  ).addEdge(START, "agent")
  .addNode("tools", toolNode)
  .addConditionalEdges("agent", shouldContinue)
  .addEdge("tools", "agent");

  return stateGraph;
}

export async function submitQuestion(messages: BaseMessage[], chatId: string){
  const workflow = createWorkflow();

  //Create checkpointer to save the state of conversation
  const checkpointer = new MemorySaver();
  const app = workflow.compile({checkpointer});

  //Run the graph and stream
  const stream = await app.streamEvents(
    {messages},
    {
      version: "v2",
      configurable: {thread_id: chatId},
      streamMode: "messages",
      runId: chatId
    }
  )

  return stream;
}
