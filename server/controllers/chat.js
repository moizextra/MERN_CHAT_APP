import { TryCatch } from "../middlewares/error.js";
import { ErrorHandler } from "../utils/ErrorHandler.js";
import { Chat } from "../models/chat.js";
import {User} from "../models/user.js";
import { emitEvent } from "../utils/emitEvent.js"; 
import { getOtherMember } from "../lib/helper.js";
import {
    ALERT,
    REFETCH_CHATS,
  } from "../constants/event.js";


const newGroupChat = TryCatch(async (req, res, next) => {
// const {name,members}=req.body;
const name="Bianry Brains"
const members=[
    "665c949a0e87ab6e2cb293c2",
    "665c8c7b54d1cdd09a9fa80a",
    "665c47da947773ce6c173d27"
  ]
const allMembers = [...members, req.user];
await Chat.create({
    name,
    groupChat: true,
    creator: req.user,
    members: allMembers,
  });
  // Notifiy all members of the group
  emitEvent(req, ALERT, allMembers, `Welcome to ${name} group`);
  // Refetching the chats for the members
  emitEvent(req, REFETCH_CHATS, members);

  return res.status(201).json({
    success: true,
    message: "Group Created",
  });

})

const getMyChats = TryCatch(async (req, res, next) => {
  const chats = await Chat.find({ members: req.user }).populate(
    "members",
    "name avatar"
  ); 
  
  const chattToReturn = chats.map(({ _id, name, members, groupChat})=>{
    const otherMember = getOtherMember(members, req.user); // it is for only chat having 2 members or we can say a chat between me and Zain etc
        return {
          _id,
          groupChat,
          avatar: groupChat
          ? members.slice(0, 3).map(({ avatar }) => avatar.url)
          : [otherMember.avatar.url],
          name: groupChat ? name : otherMember.name,
          members: members.reduce((prev, curr) => {  // This code is creating an array of user IDs that are not the same as the current user's ID, by iterating over a list of user IDs and adding each ID to the array if it's not equal to the current user's ID.
            if (curr._id.toString() !== req.user.toString()) {
              prev.push(curr._id);
            }
            return prev;
          }, []),
        }
  })
  return res.status(200).json({
    success: true,
    chats: chattToReturn,
  });

});

const getMyGroups=TryCatch(async(req,res,next)=>{
  const chats = await Chat.find({
    members: req.user,
    groupChat: true,
    creator: req.user,
  }).populate("members", "name avatar");

  const groups = chats.map(({ members, _id, groupChat, name }) => ({
    _id,
    groupChat,
    name,
    avatar: members.slice(0, 3).map(({ avatar }) => avatar.url),
  }));

  return res.status(200).json({
    success: true,
    groups,
  });
});


const addMembers = TryCatch(async (req, res, next) => {
  const { chatId, members } = req.body;
  const chat = await Chat.findById(chatId);
  
  if (!chat) return next(new ErrorHandler("Chat not found", 404));

  if (!chat.groupChat)
    return next(new ErrorHandler("This is not a group chat", 400));

  if (chat.creator.toString() !== req.user.toString())
    return next(new ErrorHandler("You are not allowed to add members", 403));

  const allNewMembersPromise = members.map((i) => User.findById(i, "name"));

  const allNewMembers = await Promise.all(allNewMembersPromise);
  
  const uniqueMembers = allNewMembers
    .filter((i) => !chat.members.includes(i._id.toString()))
    .map((i) => i._id);

    chat.members.push(...uniqueMembers);

    if (chat.members.length > 100)
      return next(new ErrorHandler("Group members limit reached", 400));
  
    await chat.save();
  
    const allUsersName = allNewMembers.map((i) => i.name).join(", ");
    emitEvent(
      req,
      ALERT,
      chat.members,
      `${allUsersName} has been added in the group`
    );
  
    emitEvent(req, REFETCH_CHATS, chat.members);
  
    return res.status(200).json({
      success: true,
      message: "Members added successfully",
    });

});


const leaveGroup = TryCatch(async (req, res, next) => {
  const chatId = req.params.id;

  const chat = await Chat.findById(chatId);

  if (!chat) return next(new ErrorHandler("Chat not found", 404));

  if (!chat.groupChat)
    return next(new ErrorHandler("This is not a group chat", 400));

  const remainingMembers = chat.members.filter(
    (member) => member.toString() !== req.user.toString()
  );

  if (remainingMembers.length < 3)
    return next(new ErrorHandler("Group must have at least 3 members", 400));

  if (chat.creator.toString() === req.user.toString()) {
    const randomElement = Math.floor(Math.random() * remainingMembers.length);
    const newCreator = remainingMembers[randomElement];
    chat.creator = newCreator;
  }

  chat.members = remainingMembers;

  const [user] = await Promise.all([
    User.findById(req.user, "name"),
    chat.save(),
  ]);

  emitEvent(req, ALERT, chat.members, {
    chatId,
    message: `User ${user.name} has left the group`,
  });

  return res.status(200).json({
    success: true,
    message: "Leave Group Successfully",
  });
});
const removeMember = TryCatch(async (req, res, next) => {
  const { userId, chatId } = req.body;

  const [chat, userThatWillBeRemoved] = await Promise.all([
    Chat.findById(chatId),
    User.findById(userId, "name"),
  ]);

  if (!chat) return next(new ErrorHandler("Chat not found", 404));

  if (!chat.groupChat)
    return next(new ErrorHandler("This is not a group chat", 400));

  if (chat.creator.toString() !== req.user.toString())
    return next(new ErrorHandler("You are not allowed to add members", 403));

  if (chat.members.length <= 3)
    return next(new ErrorHandler("Group must have at least 3 members", 400));

  const allChatMembers = chat.members.map((i) => i.toString());

  chat.members = chat.members.filter(
    (member) => member.toString() !== userId.toString()
  );

  await chat.save();

  emitEvent(req, ALERT, chat.members, {
    message: `${userThatWillBeRemoved.name} has been removed from the group`,
    chatId,
  });

  emitEvent(req, REFETCH_CHATS, allChatMembers);

  return res.status(200).json({
    success: true,
    message: "Member removed successfully",
  });
});



export {newGroupChat,getMyChats,getMyGroups,addMembers,leaveGroup,removeMember}
