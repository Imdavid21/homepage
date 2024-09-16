import React from 'react';
import Header from './components/Header';
import Hero from './components/Hero';
import ContentSection from './components/ContentSection';
import Footer from './components/Footer';
import './styles.css'; // Assuming you're using a global CSS file

const App = () => {
  return (
    <div>
      <Header />
      <Hero />
      <ContentSection
        title="What is Central LLM?"
        description="Central LLM is a unified chat interface that allows users to interact with multiple language models seamlessly."
        imgSrc="/imgs/sections/1.jpeg"
        imgLeft={true}
      />
      <ContentSection
        title="Why Choose Central LLM?"
        description="Central LLM offers unique advantages that set it apart from other solutions."
        imgSrc="/imgs/sections/2.jpeg"
        imgLeft={false}
      />
      <Footer />
    </div>
  );
};

export default App;
