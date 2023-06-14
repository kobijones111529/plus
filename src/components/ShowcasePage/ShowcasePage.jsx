import React, { useEffect } from "react";
import { useDispatch } from "react-redux";
import { useSelector } from "react-redux";
import { useHistory } from "react-router-dom";

function ShowcasePage() {
  const dispatch = useDispatch();
  const randomMeme = useSelector((store) => store.memeStorage);
  const history = useHistory();

  useEffect(() => {
    dispatch({
      type: 'SAGA_GET_A_RANDOM_MEME'
    });
  }, []);

  console.log("Random Meme", randomMeme);

  const handleSwipeUp = () => {
      history.push('/reviewPage');
  };

  let startY;

  const touchStart = (event) => {
    const touch = event.touches[0];
    startY = touch.clientY;
  };

  const touchEnd = (event) => {
    const touch = event.changedTouches[0];
    const deltaY = touch.clientY - startY;

    if (deltaY < -50) {
      handleSwipeUp();
    }
  };

  return (
    <div
      className="memeName"
      onTouchStart={touchStart}
      onTouchEnd={touchEnd}
    >
      {<img src={randomMeme}/>}
    </div>
  );
}

export default ShowcasePage;
