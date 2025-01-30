"use client";

import { Doc, Id } from '@/convex/_generated/dataModel';
import React, { useState, useEffect, useRef } from 'react'
import { Button } from './ui/button';
import { ArrowRight } from 'lucide-react';
import { ChatRequestBody } from '@/lib/types';

type ChatInterfaceProps = {
    chatId: Id<"chats">;
    intialMessages: Doc<"messages">[];
}

function ChatInterface({chatId, intialMessages}: ChatInterfaceProps) {
    const [messages, setMessages] = useState(intialMessages);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [streamedResponse, setStreamedResponse] = useState("");
    const [currentTool, setCurrentTool] = useState<{
        name: string;
        input: unknown;
    } | null>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({behavior: "smooth"});
    }, [messages, streamedResponse])

    const handleSubmit = async(e: React.FormEvent) => {
        e.preventDefault();
        
        const trimmedInput = input.trim();
        if(!trimmedInput || isLoading) return;

        setInput("");
        setStreamedResponse("");
        setCurrentTool(null);
        setIsLoading(true);


        //Adding user's message immediately for better UX
        const optimisticUserMessage: Doc<"messages"> = {
            _id: `temp_${Date.now()}`,
            chatId,
            content: trimmedInput,
            role: "user",
            createdAt: Date.now()
        } as Doc<"messages">;


        setMessages((prev) => [...prev, optimisticUserMessage]);


        //Track complete response for saving into database
        let fullResponse = "";

        //Start streaming response
        try{
            const requestBody: ChatRequestBody = {
                messages: messages.map((m) => ({role: m.role, content: m.content})),
                newMessage: trimmedInput,
                chatId
            }

            //Initialize a SSE connection
            const response = await fetch("/api/chat/stream", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(requestBody)
            })

            if(!response.ok) throw new Error(await response.text());
            if(!response.body) throw new Error("Response body is missing");

            //**Handle Streaming**
    
        } catch(e){
            //Handle any errors during streaming
            console.error("Error sending message: ", e);
            setMessages((prev) => prev.filter((msg) => msg._id !== optimisticUserMessage._id));
            setStreamedResponse("error")
        } finally {
            setIsLoading(false);
        }

    }


  return (
    <main className='flex flex-col h-[calc(100vh-theme(spacing.14))]'>
        {/* Messages */}
        <section></section>
        {/* Input Footer */}
        <footer>
            <form onSubmit={handleSubmit} className="max-w-4xl mx-auto relative">
            <div className="relative flex items-center">
                <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Message AI Agent..."
                className="flex-1 py-3 px-4 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-12 bg-gray-50 placeholder:text-gray-500"
                disabled={isLoading}
                />
                <Button
                type="submit"
                disabled={isLoading || !input.trim()}
                className={`absolute right-1.5 rounded-xl h-9 w-9 p-0 flex items-center justify-center transition-all ${
                    input.trim()
                    ? "bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                    : "bg-gray-100 text-gray-400"
                }`}
                >
                    <ArrowRight />
                </Button>
            </div>
            </form>
        </footer>

    </main>
  )
}

export default ChatInterface