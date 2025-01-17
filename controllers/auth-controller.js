const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { nanoid } = require("nanoid");

const fs = require("fs/promises");
const path = require("path");
const gravatar = require("gravatar");

const { User } = require("../models/User.js");

const avatarPath = path.resolve("public", "avatars");

const ctrlWrapper = require("../decorators/ctrlWrapper.js");
const HttpError = require("../helpers/HttpError.js");
const sendEmail = require("../helpers/sendEmail.js");

const { JWT_SECRET, BASE_URL } = process.env;

const signup = async (req, res, next) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (user) {
    throw HttpError(409, `${email} is already in use`);
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const verificationToken = nanoid();

  let avatarURL = gravatar.url(email, {
    s: "200",
    r: "pg",
    d: "wavatar",
  });

  if (req.file) {
    const { path: oldPath, filename } = req.file;
    const newPath = path.join(avatarPath, filename);
    await fs.rename(oldPath, newPath);
    avatarURL = path.join("avatars", filename);
  }

  const newUser = await User.create({
    ...req.body,
    password: hashedPassword,
    avatarURL,
    verificationToken,
  });

  const verifyEmail = {
    to: email,
    subject: "Verify email",
    html: `<a target="_blank" href="${BASE_URL}/api/auth/verify/${verificationToken}">Click here to verify.</a>`,
  };

  await sendEmail(verifyEmail);

  res.status(201).json({
    email: newUser.email,
    subscription: newUser.subscription,
    avatarURL: newUser.avatarURL,
  });
};

const verify = async (req, res) => {
  const { verificationToken } = req.params;
  const user = await User.findOne({ verificationToken });

  if (!user) {
    throw HttpError(404, "User is not found.");
  }

  await User.updateOne(
    { _id: user._id },
    {
      verify: true,
      verificationToken: null,
    }
  );

  res.status(200).json({
    message: "Verification is successful.",
  });
};

const resendVerifiedEmail = async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });

  if (!user) {
    throw HttpError(400, "Missing required field email.");
  }

  if (user.verify) {
    throw HttpError(400, "Verification has already been passed.");
  }

  const verifyEmail = {
    to: email,
    subject: "Verify email",
    html: `<a target="_blank" href="${BASE_URL}/api/auth/verify/${user.verificationToken}">Click here to verify.</a>`,
  };

  await sendEmail(verifyEmail);

  res.json({
    message: "Verification email has been sent.",
  });
};

const signin = async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user) {
    throw HttpError(401, "Email or password is wrong.");
  }
  const passwordCompare = await bcrypt.compare(password, user.password);
  if (!passwordCompare) {
    throw HttpError(401, "Email or password is wrong.");
  }

  if (!user.verify) {
    throw HttpError(401, "Email is not verified");
  }

  const payload = {
    id: user._id,
  };

  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "23h" });
  await User.findByIdAndUpdate(user._id, { token });

  res.json({
    token,
    email: user.email,
    subscription: user.subscription,
  });
};

const getCurrent = async (req, res) => {
  const { email, subscription } = req.user;
  res.json({
    email,
    subscription,
  });
};

const signOut = async (req, res) => {
  const { _id } = req.user;
  await User.findByIdAndUpdate(_id, { token: "" });

  res.status(204).json({ message: "Sign out is successful." });
};

const updateSubscription = async (req, res) => {
  const subscriptionOptions = ["starter", "pro", "business"];
  const { subscription } = req.body;
  const { token } = req.user;

  if (!subscriptionOptions.includes(subscription)) {
    throw HttpError(400, `Invalid subscription type`);
  }

  const result = await User.findOneAndUpdate(
    { token },
    { subscription },
    { new: true }
  );

  if (!result) {
    throw HttpError(404, "User is not found.");
  }

  res.json(result);
};

const updateAvatar = async (req, res) => {
  const { token } = req.user;
  let avatarURL = req.user.avatarURL;
  if (req.file) {
    const { path: oldPath, filename } = req.file;
    const newPath = path.join(avatarPath, filename);
    await fs.rename(oldPath, newPath);
    avatarURL = path.join("avatars", filename);
  }

  const result = await User.findOneAndUpdate(
    { token },
    { avatarURL },
    { new: true }
  );

  if (!result) {
    throw HttpError(404, "User is not found");
  }

  if (req.user.avatarURL) {
    const oldAvatarPath = path.join(path.resolve("public"), req.user.avatarURL);
    await fs.unlink(oldAvatarPath);
  }

  res.json({
    avatarURL: result.avatarURL,
  });
};

module.exports = {
  signup: ctrlWrapper(signup),
  signin: ctrlWrapper(signin),
  getCurrent: ctrlWrapper(getCurrent),
  signOut: ctrlWrapper(signOut),
  updateSubscription: ctrlWrapper(updateSubscription),
  updateAvatar: ctrlWrapper(updateAvatar),
  verify: ctrlWrapper(verify),
  resendVerifiedEmail: ctrlWrapper(resendVerifiedEmail),
};
