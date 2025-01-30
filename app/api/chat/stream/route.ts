import { getConvexClient } from "@/lib/convex";
import { ChatRequestBody, SSE_DATA_PREFIX, SSE_LINE_DELIMITER, StreamMessage, StreamMessageType } from "@/lib/types";
import { auth } from "@clerk/nextjs/server";
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

            }catch(e){
                console.error("Error in chat stream: ", e);
                return NextResponse.json(
                    {error: "Failed to start chat stream"} as const,
                    {status: 500}
                );
            }
        }

        startStream();
    

    }catch(e){
        console.error("Error in chat API: ", e);
        return {status: 500, body: "Failed to process chat request"};
    }
}