import { useState, memo, useCallback } from 'react';
import { CONTRACTS } from '../config/contracts';

const FooterInfo = memo(function FooterInfo() {
  const [showContracts, setShowContracts] = useState(false);
  
  const toggleContracts = useCallback(() => {
    setShowContracts(prev => !prev);
  }, []);
  
  return null;
});

export default FooterInfo;

