import ChatInterface from '@/components/ChatInterface'
import { api } from '@/convex/_generated/api'
import { Id } from '@/convex/_generated/dataModel'
import { getConvexClient } from '@/lib/convex'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import React from 'react'

type ChatPageProps = {
    params: Promise<{
        chatId: Id<"chats">
    }>
}

async function ChatPage({params}: ChatPageProps) {
  const {chatId} = await params;

  //User Authentication
  const {userId} = await auth();
  if(!userId){
    redirect("/");
  }

  try{
        //Get intial messages
        const convex = getConvexClient();
        const intialMessages = await convex.query(api.messages.list, {chatId});

        return (
            <div className='flex-1 overflow-hidden'>
                <ChatInterface chatId={chatId} intialMessages={intialMessages}/>
            </div>
        )
    } catch(e){
        console.error("Error loading chats: ", e);
        redirect("/dashboard");
    }
}

export default ChatPage;