import React from 'react';

const Hero = () => {
  return (
    <div className="hero bg-gradient-to-t from-zinc-50 to-white relative">
      <div className="max-w-7xl mx-auto px-4 py-24 text-center">
        <h2 className="text-6xl font-bold mb-6">
          Streamline Your AI Conversations
        </h2>
        <p className="text-xl text-muted mb-8">
          Experience the power of multiple LLMs in one chat interface.
        </p>
        <div className="flex justify-center gap-4">
          <button className="bg-primary text-white h-11 rounded-md px-8">
            Start for free
          </button>
          <button className="border border-gray-300 h-11 rounded-md px-8">
            Learn More
          </button>
        </div>
        <img
          src="/imgs/hero/1.jpeg"
          className="mt-12 max-w-full rounded-md shadow-2xl"
          alt="Hero"
        />
      </div>
    </div>
  );
};

export default Hero;
