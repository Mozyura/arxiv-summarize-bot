export interface ChannelSetting {
    channel_id: string,
    search_words: string[],
    prompt: string,
    max: number,
    model: string,
  }
  
  export interface ChannelMessage {
    channel_id: string,
    message: string[]
  }