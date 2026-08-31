import React, { createContext, useState, useEffect, useContext } from 'react';
import { getCategories } from '../firebase/items';
import { AuthContext } from './AuthContext';

export const CategoryContext = createContext();

export const CategoryProvider = ({ children }) => {
  const [categories, setCategories] = useState([]);
  const [categoryMap, setCategoryMap] = useState({});
  const [loading, setLoading] = useState(true);
  
  const { user } = useContext(AuthContext);

  const refreshCategories = async () => {
    try {
      const cats = await getCategories();
      setCategories(cats);
      
      const map = {};
      cats.forEach(c => {
        map[c.key] = c.label || c.key;
      });
      setCategoryMap(map);
    } catch (error) {
      console.error("Failed to fetch categories context:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      refreshCategories();
    } else {
      setCategories([]);
      setCategoryMap({});
      setLoading(false);
    }
  }, [user]);

  return (
    <CategoryContext.Provider value={{ categories, categoryMap, loading, refreshCategories }}>
      {children}
    </CategoryContext.Provider>
  );
};
