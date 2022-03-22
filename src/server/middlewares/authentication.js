import authenticationController from '../controllers/authentication';

export const getAccount = async (req, res, next) => {
  req.account = await authenticationController.getAuthenticatedAccount(req);
  next();
};

export const isAuthenticated = async (req, res, next) => {
  const account = await authenticationController.getAuthenticatedAccount(req);
  if (!account) {
    res.status(401).json({
      success: false,
      code: 'NOT_AUTHENTICATED',
    });
    return;
  }

  next();
};

export default null;