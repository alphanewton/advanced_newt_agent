import { api } from "@/convex/_generated/api";
import { getConvexClient } from "@/lib/convex";
import { submitQuestion } from "@/lib/langgraph";
import { ChatRequestBody, SSE_DATA_PREFIX, SSE_DONE_MESSAGE, SSE_LINE_DELIMITER, StreamMessage, StreamMessageType } from "@/lib/types";
import { auth } from "@clerk/nextjs/server";
import { AIMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import { Content } from "next/font/google";
import { NextResponse } from "next/server";

function sendSSEMessage(
    writer: WritableStreamDefaultWriter<Uint8Array>,
    data: StreamMessage
  ) {
    const encoder = new TextEncoder();
    return writer.write(
      encoder.encode(
        `${SSE_DATA_PREFIX}${JSON.stringify(data)}${SSE_LINE_DELIMITER}`
      )
    );
  }

export async function POST(req: Request){
    try{
        const {userId} = await auth();
        if(!userId){
            return {status: 401, body: "Unauthorized"};
        } 

        const body = (await req.json()) as ChatRequestBody;
        const {messages, newMessage, chatId} = body;

        const convex = getConvexClient();

        //Create stream with larger queue strategy for better performance
        const stream = new TransformStream({}, {highWaterMark: 1024});
        const writer = stream.writable.getWriter();

        const response = new Response(stream.readable, {
            headers: {
                "Content-Type": "text/event-stream",
                Connection: "keep-alive",
                "X-Accel-Buffering": "no", //Diable buffering for nginx which is required for SSE to work properly
            },
        }); 

        const startStream = async () => {
            try{
                //Send intial connection established message
                await sendSSEMessage(writer, {type: StreamMessageType.Connected})

                //Send user message to convex
                await convex.mutation(api.messages.send, {
                    chatId,
                    content: newMessage
                });

                //Convert messages to Langchain format
                const langChainMessages = [
                    ...messages.map((msg) =>
                        msg.role === "user"
                        ? new HumanMessage(msg.content)
                        : new AIMessage(msg.content) 
                    )
                ]

                try{
                    //Create event stream
                    const eventStream = await submitQuestion(langChainMessages, chatId);

                    //Process the events
                    for await (const event of eventStream) {
                        // console.log("🔄 Event:", event);
            
                        if (event.event === "on_chat_model_stream") {
                          const token = event.data.chunk;
                          if (token) {
                            // Access the text property from the AIMessageChunk
                            const text = token.content.at(0)?.["text"];
                            if (text) {
                              await sendSSEMessage(writer, {
                                type: StreamMessageType.Token,
                                token: text,
                              });
                            }
                          }
                        } else if (event.event === "on_tool_start") {
                          await sendSSEMessage(writer, {
                            type: StreamMessageType.ToolStart,
                            tool: event.name || "unknown",
                            input: event.data.input,
                          });
                        } else if (event.event === "on_tool_end") {
                          const toolMessage = new ToolMessage(event.data.output);
            
                          await sendSSEMessage(writer, {
                            type: StreamMessageType.ToolEnd,
                            tool: toolMessage.lc_kwargs.name || "unknown",
                            output: event.data.output,
                          });
                        }
                    }
                      // Send completion message without storing the response
                    await sendSSEMessage(writer, { type: StreamMessageType.Done });
                }catch(e){
                    console.error("Error in event stream :", e);
                    await sendSSEMessage(writer, {
                        type: StreamMessageType.Error,
                        error: e instanceof Error ? e.message : "Stream processing failed"
                    })
                }

            }catch(e){
                console.error("Error in chat stream: ", e);
                return NextResponse.json(
                    {error: "Failed to start chat stream"} as const,
                    {status: 500}
                );
            } finally{
                try{
                    await writer.close();
                }catch (closeError){
                    console.error("Error closing writer:", closeError)
                }
            }
        }

        startStream();


        return response;
    

    }catch(e){
        console.error("Error in chat API: ", e);
        return {status: 500, body: "Failed to process chat request"};
    }
}