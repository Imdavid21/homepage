import React from 'react';

const ContentSection = ({ title, description, imgSrc, imgLeft }) => {
  return (
    <div className="content-section py-16">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center">
        {imgLeft && (
          <div className="order-1 md:order-1">
            <img
              src={imgSrc}
              alt={title}
              className="max-w-md rounded-xl shadow-xl"
            />
          </div>
        )}
        <div className="order-2 md:order-2 md:ml-16">
          <h2 className="text-4xl font-bold">{title}</h2>
          <p className="mt-6 text-lg">{description}</p>
        </div>
        {!imgLeft && (
          <div className="order-1 md:order-2">
            <img
              src={imgSrc}
              alt={title}
              className="max-w-md rounded-xl shadow-xl"
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default ContentSection;
